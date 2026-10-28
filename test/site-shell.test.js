const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const countries = require('../assets/js/countries.js');
const source = fs.readFileSync(require.resolve('../assets/js/site-shell.js'), 'utf8');

function boot(search = '', saved = null) {
  function element() { return { dataset:{}, children:[], nodes:{},
    setAttribute(k,v){this[k]=v;}, getAttribute(k){return this[k];},
    querySelector(k){return this.nodes[k] ||= element();},
    appendChild(child){this.children.push(child); if(child.selected)this.value=child.value;},
    append(...children){this.children.push(...children);}, replaceChildren(){this.children=[];},
    addEventListener(type,cb){this[type]=cb;}, showModal(){this.open=true;}
  }; }
  const floating = element();
  const dialog = element();
  let clicks;
  const context = { URL, URLSearchParams, location: { search }, window: {
    RSCountries: { ...countries, resolveCountrySync: () => ({code:'CM'}), storageGet: () => saved },
    RS_FRENCH: { Products: 'Produits' }
  }, document: {createElement: tag => tag === 'dialog' ? dialog : tag === 'a' && !floating.id ? floating : element(), addEventListener: (type,cb) => {clicks=cb;}, body: {appendChild() {}}, querySelectorAll: () => [], querySelector: () => null} };
  vm.runInNewContext(source, context);
  return { site: context.window.RSSite, floating, dialog, click: (wechat=false) => clicks({target:{closest:()=>({href:'https://wa.me/237681129183',hasAttribute:()=>false,querySelector:()=>wechat})},preventDefault(){},stopImmediatePropagation(){}}) };
}

test('Cameroon defaults to French; explicit language overrides saved preference', () => {
  assert.equal(boot().site.language(), 'fr');
  assert.equal(boot('', 'en').site.language(), 'en');
  assert.equal(boot('?lang=fr', 'en').site.language(), 'fr');
  assert.equal(boot('?lang=invalid').site.language(), 'fr');
  assert.equal(boot().site.text('Products'), 'Produits');
});

test('contact chooser routes each market and only Mali has the supplied WeChat QR', () => {
  const {site,dialog,click}=boot();
  for(const code of ['CM','ML','NG','SD']) {
    site.update(code,'fr'); click();
    assert.equal(dialog.open,true);
    assert.equal(dialog.nodes.select.value,code);
    assert.match(dialog.nodes['.contact-result'].children[1].href,new RegExp(countries.COUNTRIES[code].contacts[0].phone));
  }
  site.update('ML','fr');click(true);
  assert.equal(dialog.nodes['.contact-result'].children[1].src,'assets/wechat-mali-elena.jpg');
  dialog.nodes.select.value='CM';dialog.nodes.select.change();
  assert.match(dialog.nodes['.contact-result'].children[0].textContent,/pas encore disponible/);
  assert.ok(fs.existsSync(require('node:path').join(__dirname,'../assets/wechat-mali-elena.jpg')));
});

test('floating WhatsApp follows each market without sending anything', () => {
  const {site, floating} = boot();
  for (const code of ['CM', 'ML', 'NG', 'SD']) {
    site.update(code, countries.COUNTRIES[code].lang);
    const contact = countries.COUNTRIES[code].contacts[countries.COUNTRIES[code].order_contact];
    assert.equal(new URL(floating.href).pathname, '/' + contact.phone);
    assert.ok(new URL(floating.href).searchParams.get('text'));
  }
  site.update('CM', 'fr');
  assert.match(new URL(floating.href).searchParams.get('text'), /Bonjour.*Cameroun/);
});
