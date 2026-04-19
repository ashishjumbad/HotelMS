const getDatabaseErrorMessage = (error) => {
  if (!error) {
    return 'Database request failed';
  }

  const rootError = error.errors?.[0] || error;

  if (rootError.code === 'ENOTFOUND') {
    return 'Database host could not be resolved. Check DATABASE_URL or DB_HOST in backend/.env.';
  }

  if (rootError.code === 'ECONNREFUSED') {
    return 'Database connection was refused. Verify the database server is running and reachable.';
  }

  if (rootError.code === 'ETIMEDOUT') {
    return 'Database connection timed out. The configured database host is reachable from neither this machine nor the current network.';
  }

  if (rootError.code === '28P01') {
    return 'Database authentication failed. Check the database username and password.';
  }

  if (rootError.code === '3D000') {
    return 'Database does not exist. Check the database name in backend/.env.';
  }

  if (rootError.code === '23505') {
    return rootError.detail || 'This record already exists.';
  }

  if (rootError.code === '23503') {
    return 'Related record was not found. Check the selected hotel, category, or linked data.';
  }

  if (rootError.code === '23502') {
    return `Required field missing: ${rootError.column || 'unknown field'}.`;
  }

  if (rootError.code === '22P02') {
    return 'One of the submitted values has an invalid format.';
  }

  return rootError.message || error.message || 'Database request failed';
};

module.exports = {
  getDatabaseErrorMessage
};
