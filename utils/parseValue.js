// utils/parseValue.js
export function parseValue(value, type = "string") {
  if (value === undefined || value === null) return null;

  const str = value.toString().trim();
  if (str === "" || str === "00" || str === "0") return null;

  if (type === "number") {
    return isNaN(Number(str)) ? 0 : Number(str);
  }

  if (type === "date") {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  if (type === "boolean") {
    return str.toLowerCase() === "yes" || str.toLowerCase() === "true";
  }

  return str;
}
