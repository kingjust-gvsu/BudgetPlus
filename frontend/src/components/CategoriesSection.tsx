import { useEffect, useState, type FormEvent } from 'react'
import { apiGet, apiSend } from '../api/client'
import type { Category, CategoryKind } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { EditCategoryRow } from './EditCategoryRow'

const KIND_LABELS: Record<CategoryKind, string> = { BILL: 'Bill', EXPENSE: 'Expense' }

// The user's categories: add, rename, change bill/expense, and delete.
export function CategoriesSection() {
  const { getToken } = useAuth()
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped after a change, so the list reloads
  const [version, setVersion] = useState(0)

  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>('EXPENSE')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let current = true
    getToken()
      .then((token) => apiGet<Category[]>('/categories', token))
      .then((loaded) => {
        if (!current) return
        setCategories(loaded)
        setLoadError(null)
      })
      .catch(() => {
        if (current) setLoadError("Couldn't load your categories. Please refresh the page.")
      })
    return () => {
      current = false
    }
  }, [getToken, version])

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setAddError('Enter a name.')
      return
    }
    setAddError(null)
    setAdding(true)
    try {
      await apiSend('POST', '/categories', await getToken(), { name: name.trim(), kind })
      setName('')
      setVersion((v) => v + 1)
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Adding failed. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  const update = async (id: string, changes: { name: string; kind: CategoryKind }) => {
    await apiSend('PATCH', `/categories/${id}`, await getToken(), changes)
    setEditingId(null)
    setVersion((v) => v + 1)
  }

  const remove = async (category: Category) => {
    const confirmed = window.confirm(
      `Delete "${category.name}"? Its transactions will stay, but they'll become uncategorized.`,
    )
    if (!confirmed) return
    try {
      await apiSend('DELETE', `/categories/${category.id}`, await getToken())
      setVersion((v) => v + 1)
    } catch {
      setLoadError("Couldn't delete that category. Please try again.")
    }
  }

  return (
    <section className="card" aria-labelledby="categories-heading">
      <h2 id="categories-heading">Categories</h2>
      <p className="muted section-intro">
        Bills cost what they cost and are shown neutrally. Expenses are spending you choose, with a limit.
      </p>

      <form className="form-row" onSubmit={add} aria-label="Add a category">
        <div className="field field-grow">
          <label htmlFor="new-category-name">Name</label>
          <input
            id="new-category-name"
            placeholder="e.g. Groceries"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-category-kind">Kind</label>
          <select id="new-category-kind" value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
            <option value="EXPENSE">Expense</option>
            <option value="BILL">Bill</option>
          </select>
        </div>
        <button type="submit" className="button button-primary" disabled={adding}>
          Add
        </button>
      </form>
      {addError && (
        <p className="error" role="alert">
          {addError}
        </p>
      )}

      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}

      {categories === null ? (
        !loadError && <p className="muted">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="muted">No categories yet. Add your bills (rent, electric) and expenses (groceries, gas).</p>
      ) : (
        <div className="table-scroll">
          <table className="table table-compact">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Kind</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) =>
                category.id === editingId ? (
                  <EditCategoryRow
                    key={category.id}
                    category={category}
                    onSave={(changes) => update(category.id, changes)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td>
                      <span className={`badge badge-${category.kind.toLowerCase()}`}>{KIND_LABELS[category.kind]}</span>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="link-button"
                        aria-label={`Edit ${category.name}`}
                        onClick={() => setEditingId(category.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        aria-label={`Delete ${category.name}`}
                        onClick={() => remove(category)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
