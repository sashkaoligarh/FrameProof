/**
 * Shared error fixtures for write API tests.
 */

export const MOCK_403_ENTERPRISE = {
  status: 403,
  err: 'This feature requires an enterprise plan',
};

export const MOCK_403_SCOPES = {
  status: 403,
  err: 'Insufficient scopes: file_variables:write required',
};

export const MOCK_404_NOT_FOUND = {
  status: 404,
  err: 'Not found',
};

export const MOCK_429_RATE_LIMIT = {
  status: 429,
  err: 'Rate limited',
};

export const MOCK_400_VALIDATION = {
  status: 400,
  err: 'Invalid variable type: UNKNOWN',
};
