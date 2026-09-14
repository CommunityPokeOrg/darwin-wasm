export const hex = (value: bigint | number, width = 0) => {
  const text = (typeof value === 'number' ? value.toString(16) : value.toString(16)).padStart(width, '0');
  return `0x${text}`;
};
