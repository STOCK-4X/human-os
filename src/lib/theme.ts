export const THEME_KEY = "hos-theme";

/** Inline script that applies the saved theme before first paint (no flash). */
export const themeBootScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
