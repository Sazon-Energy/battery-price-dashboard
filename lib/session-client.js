export async function checkSession() {
  const response = await fetch('/api/session');
  return response.json();
}

export async function logout() {
  await fetch('/api/logout', { method: 'POST' });
}
