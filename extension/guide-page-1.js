
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'bm/bookmarklet.txt', true);
  xhr.onload = function () {
    if (xhr.status === 200) document.getElementById('bm-link').href = xhr.responseText.trim();
  };
  xhr.send();
