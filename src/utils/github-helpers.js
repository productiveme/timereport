export function extractEngTag(title) {
  const match = title.match(/\beng\s*[#-]?\s*(\d+)\b/i);
  return match ? `eng${match[1]}` : null;
}

export function cleanEngTagFromTitle(title) {
  // Remove eng tag
  let cleaned = title.replace(/\beng\s*[#-]?\s*\d+\b/gi, "");
  // Remove empty brackets
  cleaned = cleaned.replace(/\[\s*\]/g, "");
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

export function formatTaskName(prTitle, repo) {
  const engTag = extractEngTag(prTitle);
  const cleanTitle = cleanEngTagFromTitle(prTitle);

  if (engTag) {
    return `${cleanTitle} #${engTag}`;
  } else {
    return `${cleanTitle} #${repo}`;
  }
}
