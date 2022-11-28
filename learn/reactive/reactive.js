let activeEffect;
const bucket = new WeakMap();
const effectStack = [];
const data = {
  ok: true,
  text: "hello world",
  Comp1: true,
  Comp2: false,
  foo: 1,
  bar: 2
};

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
}

function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(effectFn);
    const res = fn();
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
    return res;
  };
  effectFn.options = options;
  effectFn.deps = [];
  if (!options.lazy) {
    effectFn();
  }
  return effectFn;
}
const track = function (target, key) {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()));
  }
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, (deps = new Set()));
  }
  deps.add(activeEffect);
  activeEffect.deps.push(deps);
};
const trigger = function (target, key) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effects = depsMap.get(key);
  const effectsToRun = new Set();
  effects &&
    effects.forEach((fn) => {
      if (fn !== activeEffect) {
        effectsToRun.add(fn);
      }
    });
  effectsToRun.forEach((effectFn) => {
    const { options } = effectFn || {};
    const { scheduler } = options || {};
    if (scheduler) {
      scheduler(effectFn);
    } else {
      effectFn();
    }
  });
};

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

// 3. 副作用嵌套,activeEffect覆盖
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
  obj.Comp2 = false;

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
    schedulerr(fn) {
      jobQueue.add(fn);
      flushJob();
    }
  })
  obj.foo++;
  obj.foo++;
 *
 */

// computed
/**

  function computed(getter) {
    let value;
    let dirty = true;
    const effectFn = effect(getter, {
      lazy: true,
      scheduler() {
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

  const sum = computed(() => obj.foo + obj.bar);

  console.log(sum.value);
  console.log(sum.value);
  obj.foo++;
  console.log(sum.value);

  obj.foo++;
  effect(() => {
    console.log(sum.value)
  })

 */

// watch

function watch(value, cb, options = {}) {
  let getter;
  if (typeof value === "function") {
    getter = value;
  } else {
    getter = () => traverse(value);
  }
  let oldValue, newValue;
  let cleanup;
  const onInvalidate = (fn) => {
    cleanup = fn;
  };

  const job = () => {
    newValue = effectFn();
    if (cleanup) cleanup();
    cb && cb(newValue, oldValue, onInvalidate);
    oldValue = newValue;
  };
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      if (options?.flush === "post") {
        const p = Promise.resolve();
        p.then(job);
      } else {
        job();
      }
    }
  });
  if (options.immediate) {
    job();
  } else {
    oldValue = effectFn();
  }
}

function traverse(value, ans = new Set()) {
  if (typeof value !== "object" || value === null || ans.has(value)) return;
  ans.add(value);
  for (const key in value) {
    traverse(value[key], ans);
  }
  return value;
}

// watch(() => obj.foo, (newV, oldV) => {
//   console.log(newV, oldV);
// });
// obj.foo++;

let count = 0;
const fetchData = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      count++;
      resolve(count);
    }, 1000);
  });
};
watch(obj, async (newValue, oldValue, onInvalidate) => {
  let expired = false;
  onInvalidate(() => {
    expired = true;
  });
  let res;
  // 模拟请求
  res = await fetchData();
  if (!expired) {
    console.log("finalData", res);
  }
});
obj.foo++;
setTimeout(() => obj.foo++, 200);
