# 《vue.js 设计与实现》笔记(1~4 章)

## 第 1 章

命令式编程与声明式编程
关注结果（声明式）和关注过程（命令式）

运行时和编译时（vue、react、svelte）
坐火车时，进站检票（编译时）和上车检票（运行时）

框架性能与可维护性

## 第 2 章

框架设计的考虑因素

- 上手体验：足够的提示和引导
- 代码体积与 tree-shaking：用尽量少的代码实现尽量多的功能,去除 es 模块死代码，tree-shaking 处理副作用，需要手动告知，怎么告知，添加注释代码"/_#*PURE*_/"
- 构建输出产物和开关：灵活配置，生产环境和开发环境使用不同的包
- 错误处理：健壮、心智负担
- ts 类型支持：维护性

总结一句话：体验、性能、灵活可配置、健壮、可维护

## 第 3 章

vue.js 是基于编译时+运行时的架构,**模版**通过编译器转化成虚拟 dom,**虚拟 dom**通过渲染器渲染成真实 dom

虚拟 dom 即对真实 dom 的 js 对象形式的描述，组件是对一组 dom 元素的封装，也能用虚拟 dom 来进行描述，这些描述即需要进行渲染的内容。

渲染器实现

```
function renderer(vnode, container) {
  if (typeof vnode.tag === 'string') {
    const el = document.createElement(vnode.tag);
    for (const key in vnode.props) {
      if (/^on/.test(key)) {
        el.addEventListener(key.substr(2).toLowerCase(), vnode.props[key])
      }
    }
    if (typeof vnode.children === 'string') {
      el.appendChild(document.createTextNode(vnode.children))
    } else if (Array.isArray(vnode.children)) {
      vnode.children.forEach(child => renderer(child, el));
    }
    container.appendChild(el);
  } else if (
    typeof vnode.tag === 'function' ||
    typeof vnode.tag === 'object'
  ) {
    const subtree = vnode.tag;
    renderer(subtree, container);
  }
}
```

编译器的作用将模版编译成渲染函数，模版的工作原理即将 template 标签里的模版内容编译成渲染函数，例如

一个 vue 组件

```
<template>
  <div @click="handle">
    click me
  </div>
<template>
<script>
  export default {
    data(){/*...*/},
    methods:{
      handler:()=>{/*...*/}
    }
  }
</script>
```

编译之后的样子

```
export default {
  data(){/*...*/}
  methods:{
    handler:()=>{/*...*/}
  },
  render(){
    return h('div',{onClick:handler},'click me');
  }
}

```

## 第 4 章

副作用函数：执行会对函数外部产生直接或间接影响的函数

最简单的响应式

```
const bucket = new Set();

const data = { text: 'initial' };

const obj = new Proxy(data, {
  get(target, key) {
    bucket.add(effect);
    return target[key];
  },
  set(target, key, newVal) {
    target[key] = newVal;
    bucket.forEach(fn => fn());
    return true;
  }
});

function effect() {
  document.body.innerText = obj.text;
}
effect();
setTimeout(() => {
  obj.text = 'vue3';
}, 3000);
```

响应式系统需要考虑的问题

- 硬编码副作用，副作用函数与目标字段之间建立明确关系：副作用函数注册机制，存储的数据结构<WeakMap:<target,Map:<key,Set>>>,分离 track（追踪收集副作用）和 trigger（触发副作用执行）
- 分支切换，产生遗留副作用函数：每次副作用执行时，先把它从与之关联的依赖集合中删除。
- 副作用嵌套：副作用函数栈
- 无限递归：确保 trigger 触发执行的副作用和当前执行的副作用不相同
- 调度执行（触发副作用之后，能够决定副作用函数执行时机、次数及方式）：副作用函数第二个参数 options，传入 scheduler 方法控制调度。

完善之后的响应式

```
let activeEffect;
const bucket = new WeakMap();
const data = {
  ok: true,
  text: 'hello world',
  Comp1: true,
  Comp2: false,
  foo: 1
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
}

function effect(fn) {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    fn();
  }
  effectFn.deps = [];
  effectFn();
}
const track = function (target, key) {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()));
  }
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, deps = new Set());
  }
  deps.add(activeEffect);
  activeEffect.deps.push(deps);
}
const trigger = function (target, key) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effects = depsMap.get(key);
  const effectsToRun = new Set();
  effects && effects.forEach(fn => {
    if (fn !== activeEffect) {
      effectsToRun.add(fn);
    }
  })
  effectsToRun.forEach(effectFn => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
}

const obj = new Proxy(data, {
  get(target, key) {
    track(target, key);
    return target[key];
  },
  set(target, key, newVal) {
    target[key] = newVal;
    trigger(target, key);
  }
});

/**=========================测试用例============================== */
// 1. 响应式实现
/**
 *
  function effect() {
    document.body.innerText = obj.text;
  }
  effect();
  setTimeout(() => {
    obj.text = 'vue3';
  }, 3000);
*
*/

// 2. 分支切换，产生遗留副作用函数
/**
  effect(function effectFn() {
    console.log('reRender')
    document.body.innerText = obj.ok ? obj.text : 'not';
  });
  setTimeout(() => {
    obj.ok = false;
  }, 1000);
 */

// 3. 副作用嵌套
/**
  let temp1, temp2;
  effect(function effectFn1() {
    console.log('effectFn1 run');
    effect(function effectFn2() {
      console.log('effectFn2 run');
      temp2 = obj.Comp2;
    })
    temp1 = obj.Comp1;
  })
 */


// 4. 无限递归
/**
  effect(() => obj.foo++);
 */

// 5. 调度执行（触发副作用之后，能够决定副作用函数执行时机、次数及方式）
/**
 *
  const jobQueue = new Set();
  const p = Promise.resolve();

  let isFlushing = false;
  function flushJob() {
    if (isFlushing) return;
    isFlushing = true;
    p.then(() => {
      jobQueue.forEach(job => job());
    }).finally(() => {
      isFlushing = false;
    })
  }

  effect(() => {
    console.log(obj.foo);
  }, {
    scheduler(fn) {
      jobQueue.add(fn);
      flushJob();
    }
  })
  obj.foo++;
  obj.foo++;
 *
 */


```

**computed 和 lazy**

懒执行即手动执行副作用函数，通过 lazy 参数控制副作用函数的执行，当调用副作用函数时，通过其返回值能拿到对应的副作用函数，这样就可以手动执行了。

computed 函数即副作用函数的懒执行并缓存返回值，computed 通过两个变量来实现缓存，一个变量缓存值，另一个变量标识是否需要重新计算

computed 实现

```
function computed(getter) {
   let value;
   let dirty = true;
   const effectFn = effect(getter, {
     lazy: true,
     schedule() {
       if (!dirty) {
         dirty = true;
         trigger(obj, 'value');
       }
     }
   })
   const computeValue = {
     get value() {
       if (dirty) {
         value = effectFn();
         dirty = false;
       }
       track(obj, 'value');
       return value;
     }
   }

   return computeValue;
 }
```

**watch**

watch 函数即副作用函数的二次封装，主要依赖于副作用的调度方法，数据变化时通知并更新相应的回调函数。

watch 实现

```

function watch(value, cb, options = {}) {
  let getter;
  if (typeof value === 'function') {
    getter = value;
  } else {
    getter = () => traverse(value);
  }
  let oldValue, newValue;
  let cleanup;
  const onInvalidate = (fn) => {
    cleanup = fn;
  }

  const job = () => {
    newValue = effectFn();
    if (cleanup) cleanup();
    cb && cb(newValue, oldValue, onInvalidate);
    oldValue = newValue;
  }
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      if (options?.flush === 'post') {
        const p = Promise.resolve();
        p.then(job);
      } else {
        job();
      }
    }
  })
  if (options.immediate) {
    job();
  } else {
    oldValue = effectFn();
  }
}

function traverse(value, ans = new Set()) {
  if (typeof value !== 'object' || value === null || ans.has(value)) return;
  ans.add(value);
  for (const key in value) {
    traverse(value[key], ans);
  }
  return value;
}
```
