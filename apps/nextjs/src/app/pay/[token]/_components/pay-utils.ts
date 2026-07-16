export function formatCurrency(amount: number) {
  return `৳${Math.round(amount).toLocaleString()}`;
}
