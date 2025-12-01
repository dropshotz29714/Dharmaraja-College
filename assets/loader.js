
// 4s loader script: progress bar then exit animation
(function(){
  const loader = document.getElementById('dr-loader');
  const bar = loader && loader.querySelector('.dr-bar');
  if(!loader || !bar) return;
  bar.style.width = '0%';
  const duration = 4000;
  const start = performance.now();
  function step(now){
    const elapsed = now - start;
    let t = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    bar.style.width = (ease * 100).toFixed(2) + '%';
    if(t < 1) requestAnimationFrame(step);
    else {
      // play exit animation
      loader.classList.add('exit');
      loader.addEventListener('animationend', function(){
        try{ loader.remove(); } catch(e) {}
        // set footer year
        const y = document.getElementById('dr-year'); if(y) y.textContent = new Date().getFullYear();
      }, { once:true });
    }
  }
  requestAnimationFrame(step);
})();
