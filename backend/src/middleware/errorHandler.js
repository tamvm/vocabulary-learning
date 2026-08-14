export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.stack || err);

  if (err.expose && err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.code || 'error',
      message: err.message,
    });
  }

  // Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.details.map(detail => ({
        message: detail.message,
        path: detail.path,
      })),
    });
  }

  // Supabase errors
  if (err.code) {
    const statusCode = getSupabaseErrorStatus(err.code);
    return res.status(statusCode).json({
      error: err.message || 'Database error',
      code: err.code,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
    });
  }

  // Default server error
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: err.message }),
  });
};

function getSupabaseErrorStatus(code) {
  const errorMap = {
    '23505': 409, // unique_violation
    '23503': 400, // foreign_key_violation
    '23502': 400, // not_null_violation
    '23514': 400, // check_violation
    'PGRST116': 406, // Not acceptable
    'PGRST301': 404, // Not found
  };

  return errorMap[code] || 500;
}