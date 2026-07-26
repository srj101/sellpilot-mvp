/** SSLCommerz posts form-encoded fields; `FormDataEntryValue` can also be a File, so narrow before use. */
export function formField(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}
