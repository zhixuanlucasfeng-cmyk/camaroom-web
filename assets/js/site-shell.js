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

  // One native dialog for the shared social, hero, footer and floating links.
  var contactDialog = document.createElement('dialog');
  contactDialog.id = 'country-contact-dialog';
  contactDialog.dataset.noTranslate = '';
  contactDialog.setAttribute('aria-labelledby', 'country-contact-title');
  contactDialog.innerHTML = '<form method="dialog"><button class="contact-close" aria-label="Close">×</button></form><h2 id="country-contact-title"></h2><label for="contact-market"></label><select id="contact-market"></select><div class="contact-result" aria-live="polite"></div>';
  document.body.appendChild(contactDialog);
  var contactMarket = contactDialog.querySelector('select');
  var contactResult = contactDialog.querySelector('.contact-result');
  var contactChannel = 'whatsapp';
  var contactMessage = '';
  function contactCopy(en, fr, ar) { return language === 'fr' ? fr : language === 'ar' ? ar : en; }
  function renderContact() {
    var market = countries.COUNTRIES[contactMarket.value];
    var rep = market.contacts[market.order_contact];
    contactResult.replaceChildren();
    if (contactChannel === 'wechat' && market.wechat) {
      var name = document.createElement('p');
      name.textContent = market.wechat.name + ' · WeChat';
      var qr = document.createElement('img');
      qr.src = market.wechat.qr;
      qr.width = 946; qr.height = 1280;
      qr.alt = 'Elena · Mali · WeChat QR';
      var hint = document.createElement('p');
      hint.textContent = contactCopy('Scan with WeChat, or save the image and select it in WeChat Scan.', 'Scannez avec WeChat, ou enregistrez l’image et sélectionnez-la dans le scanner WeChat.', 'امسح الرمز عبر WeChat، أو احفظ الصورة واخترها من ماسح WeChat.');
      var imageLink = document.createElement('a');
      imageLink.href = market.wechat.qr;
      imageLink.target = '_blank'; imageLink.rel = 'noopener';
      imageLink.textContent = contactCopy('Open QR image', 'Ouvrir le code QR', 'فتح صورة الرمز');
      contactResult.append(name, qr, hint, imageLink);
      return;
    }
    var description = document.createElement('p');
    description.textContent = contactChannel === 'wechat'
      ? contactCopy('This market’s WeChat QR is not available yet. Contact the local team on WhatsApp.', 'Le code WeChat de ce marché n’est pas encore disponible. Contactez l’équipe locale sur WhatsApp.', 'رمز WeChat لهذا السوق غير متوفر بعد. تواصل مع الفريق المحلي عبر واتساب.')
      : rep.name + ' · ' + rep.phone_display;
    var link = document.createElement('a');
    link.className = 'contact-continue';
    link.dataset.contactContinue = '';
    link.target = '_blank'; link.rel = 'noopener';
    link.textContent = contactCopy('Continue on WhatsApp', 'Continuer sur WhatsApp', 'المتابعة على واتساب');
    var marketName = language === 'fr' ? market.name_fr : language === 'ar' ? market.name_ar : market.name;
    var message = contactMessage || contactCopy('Hello Restar Solar, I would like to contact your team in ', 'Bonjour Restar Solar, je souhaite contacter votre équipe : ', 'مرحبًا ريستار سولار، أود التواصل مع فريقكم في ') + marketName + '.';
    link.href = 'https://wa.me/' + rep.phone + '?text=' + encodeURIComponent(message);
    contactResult.append(description, link);
  }
  contactMarket.addEventListener('change', renderContact);
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a');
    if (!link || link.hasAttribute('data-contact-continue')) return;
    var wechat = !!link.querySelector('use[href$="ico-wechat"]');
    var url = new URL(link.href, location.href);
    if (!wechat && url.hostname !== 'wa.me' && link.id !== 'social-whatsapp') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    contactChannel = wechat ? 'wechat' : 'whatsapp';
    // Keep product enquiry context, but regenerate generic country greetings.
    contactMessage = link === floating ? '' : (url.searchParams.get('text') || '');
    contactDialog.dir = language === 'ar' ? 'rtl' : 'ltr';
    contactDialog.querySelector('h2').textContent = contactCopy('Which country’s team would you like to contact?', 'L’équipe de quel pays souhaitez-vous contacter ?', 'فريق أي بلد تود التواصل معه؟');
    contactDialog.querySelector('label').textContent = contactCopy('Country', 'Pays', 'البلد');
    contactDialog.querySelector('.contact-close').setAttribute('aria-label', contactCopy('Close', 'Fermer', 'إغلاق'));
    contactMarket.replaceChildren();
    countries.ORDER.forEach(function (code) {
      var market = countries.COUNTRIES[code];
      var option = document.createElement('option');
      option.value = code;
      option.textContent = language === 'fr' ? market.name_fr : language === 'ar' ? market.name_ar : market.name;
      option.selected = code === current;
      contactMarket.appendChild(option);
    });
    renderContact();
    contactDialog.showModal();
  }, true);

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
