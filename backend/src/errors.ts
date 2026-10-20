// Errors a route can throw; the app's error handler turns them into the matching HTTP response.

// 400: the request is missing something or has an invalid value
export class ValidationError extends Error {}

// 404: the item doesn't exist or belongs to another user
export class NotFoundError extends Error {}

// 409: the change conflicts with existing data, like a duplicate name
export class ConflictError extends Error {}
