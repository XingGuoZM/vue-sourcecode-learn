const bucket = new Set();

const data = {
  ok: true,
  text: "hello world",
  Comp1: true,
  Comp2: false,
  foo: 1
};

const obj = new Proxy(data, {
  get(target, key) {
    bucket.add(effect);
    return target[key];
  },
  set(target, key, newVal) {
    target[key] = newVal;
    bucket.forEach((fn) => fn());
    return true;
  }
});
// 1. 响应式实现
/**
 function effect() {
    document.body.innerText = obj.text;
  }
  effect();
  setTimeout(() => {
    obj.text = 'vue3';
  }, 3000);
 */

// 2. 分支切换，产生遗留副作用函数
/**
  function effect() {
    console.log('reRender')
    document.body.innerText = obj.ok ? obj.text : 'not';
  }

  effect();
  setTimeout(() => {
    obj.ok = false;
  }, 1000);
 */

// 4. 无限递归
/**
  function effect() {
    obj.foo++;
  }
  effect();
 */
