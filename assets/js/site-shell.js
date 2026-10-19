(function () {
  'use strict';
  var countries = window.RSCountries;
  var valid = function (value) { return ['en', 'fr', 'ar'].includes(value) ? value : null; };
  var preference = valid(new URLSearchParams(location.search).get('lang')) || valid(countries.storageGet('rs_language'));
  var current = (countries.resolveCountrySync() || { code: 'CM' }).code;
  var language = preference || countries.COUNTRIES[current].lang;
  var original = new WeakMap();
  var floating = document.createElement('a');
  floating.id = 'floating-whatsapp';
  floating.target = '_blank';
  floating.rel = 'noopener';
  floating.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons/social-icons.svg#ico-whatsapp"/></svg>';
  document.body.appendChild(floating);

  function text(value) {
    var table = language === 'fr' ? window.RS_FRENCH : language === 'ar' ? arabic : null;
    return table && table[value] || value;
  }
  var arabic = { Home:'الرئيسية', Products:'المنتجات', Projects:'المشاريع', Download:'التنزيلات', News:'الأخبار', FAQ:'الأسئلة الشائعة', 'Contact Us':'اتصل بنا', Country:'البلد', 'All Products':'جميع المنتجات', 'Solar Panel':'الألواح الشمسية', 'Solar Battery':'البطاريات', 'Solar Inverter':'العاكسات', 'Solar Charge Controller':'منظمات الشحن', 'Other Solar Products':'منتجات أخرى', 'Inquire Now →':'استفسر الآن ←', Submit:'إرسال', Name:'الاسم', 'Phone or email':'الهاتف أو البريد الإلكتروني', Subject:'الموضوع', Message:'الرسالة', 'Request a quote':'اطلب عرض سعر' };

  function translate(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest('script,style,[data-no-translate],#rs-msgs')) continue;
      var raw = original.get(node) || node.nodeValue;
      original.set(node, raw);
      var key = raw.trim();
      var translated = text(key);
      if (language === 'fr' && translated === key && key.startsWith('> ')) translated = '> ' + text(key.slice(2));
      if (language === 'fr' && translated === key && key.startsWith('Add: ')) translated = 'Adresse : ' + key.slice(5);
      node.nodeValue = raw.replace(key, translated);
    }
    root.querySelectorAll('[alt],[placeholder],[aria-label]').forEach(function (el) {
      ['alt','placeholder','aria-label'].forEach(function (attr) {
        if (el.hasAttribute(attr)) {
          var attribute = el.getAttributeNode(attr);
          var raw = original.get(attribute) || attribute.value;
          original.set(attribute, raw);
          attribute.value = text(raw);
        }
      });
    });
  }

  function update(code, lang) {
    current = countries.normalize(code) || 'CM';
    language = valid(lang) || countries.COUNTRIES[current].lang;
    var country = countries.COUNTRIES[current];
    var name = language === 'fr' ? country.name_fr : language === 'ar' ? country.name_ar : country.name;
    var greeting = language === 'fr' ? 'Bonjour Restar Solar, je suis au ' + name + ' et je souhaite des renseignements sur vos solutions solaires.' : language === 'ar' ? 'مرحبًا ريستار سولار، أود الاستفسار عن حلول الطاقة الشمسية في ' + name + '.' : 'Hello Restar Solar, I am in ' + name + ' and would like to ask about your solar solutions.';
    var contact = country.contacts[country.order_contact];
    floating.href = 'https://wa.me/' + contact.phone + '?text=' + encodeURIComponent(greeting);
    floating.setAttribute('aria-label', language === 'fr' ? 'Discuter sur WhatsApp' : language === 'ar' ? 'تحدث عبر واتساب' : 'Chat on WhatsApp');
    floating.title = floating.getAttribute('aria-label');
    document.querySelectorAll('a[href]').forEach(function (link) {
      if (link === floating || link.getAttribute('href').startsWith('#')) return;
      var url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !/\/(?:index|products|projects|downloads|news|faq|contact)\.html$/.test(url.pathname)) return;
      url.searchParams.set('country', current);
      url.searchParams.set('lang', language);
      link.href = url.pathname + url.search + url.hash;
    });
  }

  window.RSSite = {
    preference: preference,
    language: function () { return language; },
    saveLanguage: function (lang) { countries.storageSet('rs_language', lang); },
    text: text, translate: translate, update: update
  };
  update(current, language);
  if (document.querySelector('.site-header')) {
    var picker = document.createElement('div');
    picker.className = 'site-language';
    picker.setAttribute('aria-label', 'Language');
    ['en','fr','ar'].forEach(function (lang) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = lang.toUpperCase();
      button.setAttribute('aria-pressed', String(lang === language));
      button.onclick = function () {
        countries.storageSet('rs_language', lang);
        var url = new URL(location.href);
        url.searchParams.set('lang', lang);
        url.searchParams.set('country', current);
        location.assign(url.href);
      };
      picker.appendChild(button);
    });
    document.querySelector('.site-header').prepend(picker);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    translate(document.body);
    document.title = text(document.title.split(' | ')[0]) + ' | Restar Solar';
  }
})();
