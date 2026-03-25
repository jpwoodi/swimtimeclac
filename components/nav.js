(function () {
  document.addEventListener('DOMContentLoaded', function () {
  var path = window.location.pathname;
  var CONTENT_TOP_GAP = 24;

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
    if (topLinks[i].href === '/sports/index.html') {
      li.className = 'top-nav-sports-item';
      a.classList.add('top-nav-sports-link');
    }
    li.appendChild(a);
    ul.appendChild(li);
  }

  topNav.appendChild(hamburger);
  topNav.appendChild(ul);
  document.body.prepend(topNav);

  // Build sub-nav for sports section
  if (isSportsSection()) {
    var body = document.body;
    var sportsNavItem = ul.querySelector('.top-nav-sports-item');
    var subNav = document.createElement('nav');
    subNav.className = 'sub-nav';
    subNav.id = 'sports-sub-nav';
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

    function isMobileViewport() {
      return window.matchMedia('(max-width: 768px)').matches;
    }

    function updateBodyPadding() {
      var navOffset = topNav.offsetHeight + CONTENT_TOP_GAP;
      if (isMobileViewport() || subNav.classList.contains('is-visible')) {
        navOffset += subNav.offsetHeight;
      }
      body.style.paddingTop = navOffset + 'px';
    }

    function setSubNavVisible(visible) {
      subNav.classList.toggle('is-visible', visible);
      updateBodyPadding();
    }

    var hideTimer = null;

    function scheduleHide() {
      hideTimer = setTimeout(function () {
        setSubNavVisible(false);
      }, 100);
    }

    function cancelHide() {
      clearTimeout(hideTimer);
    }

    if (sportsNavItem) {
      sportsNavItem.addEventListener('mouseenter', function () {
        cancelHide();
        setSubNavVisible(true);
      });

      sportsNavItem.addEventListener('mouseleave', function (event) {
        if (subNav.contains(event.relatedTarget)) return;
        scheduleHide();
      });

      sportsNavItem.addEventListener('focusin', function () {
        cancelHide();
        setSubNavVisible(true);
      });

      sportsNavItem.addEventListener('focusout', function (event) {
        if (sportsNavItem.contains(event.relatedTarget) || subNav.contains(event.relatedTarget)) return;
        setSubNavVisible(false);
      });
    }

    subNav.addEventListener('mouseenter', function () {
      cancelHide();
      setSubNavVisible(true);
    });

    subNav.addEventListener('mouseleave', function (event) {
      if (sportsNavItem && sportsNavItem.contains(event.relatedTarget)) return;
      scheduleHide();
    });

    subNav.addEventListener('focusin', function () {
      setSubNavVisible(true);
    });

    subNav.addEventListener('focusout', function (event) {
      if ((sportsNavItem && sportsNavItem.contains(event.relatedTarget)) || subNav.contains(event.relatedTarget)) return;
      setSubNavVisible(false);
    });

    function syncSubNavForViewport() {
      setSubNavVisible(isMobileViewport());
    }

    syncSubNavForViewport();
    window.addEventListener('resize', syncSubNavForViewport);
  }
  });
})();
