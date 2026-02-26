(function () {
  document.addEventListener('DOMContentLoaded', function () {
  var path = window.location.pathname;

  var topLinks = [
    { href: '/index.html', label: 'Home' },
    { href: '/work/index.html', label: 'Work' },
    { href: '/music/index.html', label: 'Music' },
    { href: '/sports/index.html', label: 'Sports' },
  ];

  var sportsSubLinks = [
    { href: '/sports/index.html', label: 'Overview' },
    { href: '/sports/calculator.html', label: 'Swim Calculator' },
    { href: '/sports/css.html', label: 'CSS Calculator' },
    { href: '/sports/pools.html', label: 'Pool Finder' },
    { href: '/sports/stravafeed.html', label: 'Swim Feed' },
    { href: '/sports/swim-plan-generator.html', label: 'AI Swim Plan' },
    { href: '/sports/swim-plan-library.html', label: 'Swim Plans' },
    { href: '/sports/cyclecommute.html', label: 'Cycle Commute' },
  ];

  function isActive(href) {
    return path === href || path.endsWith(href);
  }

  function isSportsSection() {
    return path.startsWith('/sports/') || path.startsWith('/sports\\');
  }

  // Determine which top-nav item is active
  function topActiveHref() {
    if (isSportsSection()) return '/sports/index.html';
    for (var i = 0; i < topLinks.length; i++) {
      if (isActive(topLinks[i].href)) return topLinks[i].href;
    }
    // Work section articles
    if (path.startsWith('/work/')) return '/work/index.html';
    return '/index.html';
  }

  var activeTop = topActiveHref();

  // Build top nav
  var topNav = document.createElement('nav');
  topNav.className = 'top-nav';

  var hamburger = document.createElement('button');
  hamburger.className = 'hamburger';
  hamburger.type = 'button';
  hamburger.setAttribute('aria-label', 'Toggle navigation menu');
  hamburger.setAttribute('aria-controls', 'primary-nav');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.innerHTML = '&#9776;';
  hamburger.addEventListener('click', function () {
    var ul = topNav.querySelector('ul');
    var expanded = ul.classList.toggle('expanded');
    hamburger.setAttribute('aria-expanded', String(expanded));
  });

  var ul = document.createElement('ul');
  ul.id = 'primary-nav';
  for (var i = 0; i < topLinks.length; i++) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = topLinks[i].href;
    a.textContent = topLinks[i].label;
    if (topLinks[i].href === activeTop) a.className = 'active';
    li.appendChild(a);
    ul.appendChild(li);
  }

  topNav.appendChild(hamburger);
  topNav.appendChild(ul);
  document.body.prepend(topNav);

  // Build sub-nav for sports section
  if (isSportsSection()) {
    var subNav = document.createElement('nav');
    subNav.className = 'sub-nav';
    var subUl = document.createElement('ul');
    for (var j = 0; j < sportsSubLinks.length; j++) {
      var subLi = document.createElement('li');
      var subA = document.createElement('a');
      subA.href = sportsSubLinks[j].href;
      subA.textContent = sportsSubLinks[j].label;
      if (isActive(sportsSubLinks[j].href)) subA.className = 'active';
      subLi.appendChild(subA);
      subUl.appendChild(subLi);
    }
    subNav.appendChild(subUl);
    topNav.insertAdjacentElement('afterend', subNav);
  }
  });
})();
