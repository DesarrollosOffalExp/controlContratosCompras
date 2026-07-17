// La API vive en el mismo origen que la SPA (Express sirve el build en Azure).
// En desarrollo, el proxy de Angular (proxy.conf.json) reenvía /api al backend
// local, así todo es same-origin y las cookies de Easy Auth funcionan igual.
export const environment = {
  production: false,
  apiUrl: '/api',
};
