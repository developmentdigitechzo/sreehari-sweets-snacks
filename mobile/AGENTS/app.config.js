// Extends app.json. Android push needs Firebase: the google-services.json from your Firebase project.
// The file is only wired in when it is present (or GOOGLE_SERVICES_JSON points at it, e.g. an EAS file secret), so builds
// keep working before Firebase is set up; push simply stays unconfigured until then.
const fs = require('fs');

module.exports = ({ config }) => {
  const fromEnv = process.env.GOOGLE_SERVICES_JSON;
  const local = './google-services.json';
  const googleServicesFile = fromEnv || (fs.existsSync(local) ? local : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
