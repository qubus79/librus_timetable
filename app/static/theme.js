// Runs before first paint so the saved theme never flashes.
(function(){var t='system';try{t=localStorage.getItem('theme')||'system'}catch(e){}if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;})();
