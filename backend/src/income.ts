import type { Database } from './db.ts'
import { ConflictError } from './errors.ts'

// Income by month. A user has regular income sources (jobs) whose amounts carry over: each month
// uses the most recent amount set in that month or before it. On top of that, "other" income
// (a bonus, a tax refund) belongs to a single month and starts at $0 every month.

export type IncomeAmount = { month: string; amountCents: number } // month = YYYY-MM

export type IncomeSourceRecord = {
  id: string
  name: string
  // Amounts set so far, oldest first; each applies from its month until the next one
  amounts: IncomeAmount[]
}

export type IncomeData = {
  sources: IncomeSourceRecord[]
  // Other income by month; months without any are left out
  other: Map<string, number>
}

export type MonthIncome = {
  month: string
  // The sources paying this month: started by now and not stopped (an amount of $0 means stopped)
  sources: {
    id: string
    name: string
    amountCents: number
    // The month this amount was set in: this month or an earlier one it carries over from
    setIn: string
  }[]
  otherCents: number
  // null when there's no income at all yet (no sources and no other income)
  totalCents: number | null
}

export function incomeForMonth(data: IncomeData, month: string): MonthIncome {
  const sources = data.sources.flatMap((source) => {
    const latest = source.amounts.filter((a) => a.month <= month).at(-1)
    if (!latest || latest.amountCents === 0) return []
    return [{ id: source.id, name: source.name, amountCents: latest.amountCents, setIn: latest.month }]
  })
  const otherCents = data.other.get(month) ?? 0
  const hasIncome = data.sources.length > 0 || otherCents !== 0
  return {
    month,
    sources,
    otherCents,
    totalCents: hasIncome ? sources.reduce((sum, s) => sum + s.amountCents, otherCents) : null,
  }
}

export const SOURCE_NAME_TAKEN = 'You already have an income source with that name'

// Reads and writes a user's income. Every method is scoped to one user.
export type IncomeStore = {
  load(userId: string): Promise<IncomeData>
  // Adds a source with its first amount, from `month` on. Throws ConflictError for a duplicate name.
  createSource(userId: string, name: string, month: string, amountCents: number): Promise<void>
  // These return false if the source doesn't exist or belongs to another user
  renameSource(userId: string, id: string, name: string): Promise<boolean>
  // Stops a source from `month` on; earlier months keep it. A source that hadn't started before
  // `month` is removed completely.
  stopSource(userId: string, id: string, month: string): Promise<boolean>
  // Sets a source's amount from `month` on (later months that set their own amount keep it)
  setAmount(userId: string, id: string, month: string, amountCents: number): Promise<boolean>
  setOther(userId: string, month: string, amountCents: number): Promise<void>
}

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002'

export function createIncomeStore(db: Database): IncomeStore {
  const owns = async (userId: string, id: string) => (await db.incomeSource.count({ where: { id, userId } })) > 0

  return {
    load: async (userId) => {
      const [sources, other] = await Promise.all([
        db.incomeSource.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, amounts: { orderBy: { month: 'asc' }, select: { month: true, amountCents: true } } },
        }),
        db.otherIncome.findMany({ where: { userId }, select: { month: true, amountCents: true } }),
      ])
      return { sources, other: new Map(other.map((o) => [o.month, o.amountCents])) }
    },

    createSource: async (userId, name, month, amountCents) => {
      try {
        await db.incomeSource.create({ data: { userId, name, amounts: { create: { month, amountCents } } } })
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(SOURCE_NAME_TAKEN)
        throw error
      }
    },

    renameSource: async (userId, id, name) => {
      if (!(await owns(userId, id))) return false
      try {
        await db.incomeSource.update({ where: { id }, data: { name } })
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(SOURCE_NAME_TAKEN)
        throw error
      }
      return true
    },

    stopSource: async (userId, id, month) => {
      if (!(await owns(userId, id))) return false
      await db.$transaction(async (tx) => {
        await tx.incomeAmount.deleteMany({ where: { sourceId: id, month: { gte: month } } })
        const earlier = await tx.incomeAmount.count({ where: { sourceId: id } })
        if (earlier === 0) await tx.incomeSource.delete({ where: { id } })
        else await tx.incomeAmount.create({ data: { sourceId: id, month, amountCents: 0 } })
      })
      return true
    },

    setAmount: async (userId, id, month, amountCents) => {
      if (!(await owns(userId, id))) return false
      await db.incomeAmount.upsert({
        where: { sourceId_month: { sourceId: id, month } },
        create: { sourceId: id, month, amountCents },
        update: { amountCents },
      })
      return true
    },

    setOther: async (userId, month, amountCents) => {
      if (amountCents === 0) {
        await db.otherIncome.deleteMany({ where: { userId, month } })
        return
      }
      await db.otherIncome.upsert({
        where: { userId_month: { userId, month } },
        create: { userId, month, amountCents },
        update: { amountCents },
      })
    },
  }
}
