// Farbschema vor dem ersten Zeichnen setzen (verhindert Aufblitzen)
try{var l=JSON.parse(localStorage.getItem("kb-look")||"{}");if(l.accent&&l.accent!=="graphit")document.documentElement.setAttribute("data-accent",l.accent);if(l.theme==="light"||l.theme==="dark")document.documentElement.setAttribute("data-theme",l.theme);}catch(e){}
