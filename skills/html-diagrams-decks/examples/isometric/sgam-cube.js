/* focus bar, icon injection and entrance trigger for the isometric cube */
(function(){
  var svg=document.getElementById('cube3d'); if(!svg) return;
  try{ document.getElementById('cube-ico').innerHTML=window.EDGE_ICONS||''; }catch(e){}
  var bar=document.querySelector('.focusbar');
  if(bar) bar.addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b) return;
    var f=b.getAttribute('data-f');
    if(f==='all') svg.removeAttribute('data-focus'); else svg.setAttribute('data-focus',f);
    bar.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed',x===b?'true':'false'); });
  });
  if('IntersectionObserver' in window){
    svg.classList.add('armed');
    var io=new IntersectionObserver(function(es){ es.forEach(function(en){ if(en.isIntersecting){ svg.classList.add('in'); io.disconnect(); } }); },{threshold:.15});
    io.observe(svg);
  }
})();
