(function() {
  var div = document.createElement('div');
  div.style.cssText = 'font-family: sans-serif; padding: 24px; background: #f0f7ff; border-radius: 8px; border: 2px solid #77a7b9; max-width: 400px; margin: 0 auto; text-align: center;';
  div.innerHTML = '<h2 style="color: #1a1a1a; margin: 0 0 8px 0;">✅ GitHub → Webflow werkt!</h2><p style="color: #555; margin: 0;">Dit blokje wordt ingeladen vanuit GitHub.</p>';
  document.currentScript
    ? document.currentScript.parentNode.insertBefore(div, document.currentScript.nextSibling)
    : document.body.appendChild(div);
})();
