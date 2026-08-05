export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

/**
 * Computes derived stock status based on inventory quantity and low-stock threshold setting.
 */
export function getStockStatus(inventoryQuantity: number, threshold = 5): StockStatus {
  if (inventoryQuantity <= 0) return "out_of_stock";
  if (inventoryQuantity <= threshold) return "low_stock";
  return "in_stock";
}
