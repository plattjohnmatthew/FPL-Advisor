const credential = /vercel_blob_rw_[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{24,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/;
const internalConfiguration = /OPENAI_API_KEY|SUPADATA_API_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|BLOB_READ_WRITE_TOKEN/;
export function assertPublicText(text, sensitiveValues = []) {
  if (credential.test(text) || internalConfiguration.test(text)) throw new Error("Public surface contains credential or private configuration material");
  for (const value of sensitiveValues) {
    if (typeof value !== "string" || value.trim().length < 12) continue;
    const escaped = JSON.stringify(value).slice(1,-1);
    const html = value.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("'","&#x27;").replaceAll("<","&lt;").replaceAll(">","&gt;");
    if ([value,escaped,html,encodeURIComponent(value)].some(secret=>text.includes(secret))) throw new Error("Public surface contains private secret or instruction text");
  }
}
