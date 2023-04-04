﻿var pas = { $libimports: {}};

var rtl = {

  version: 20200,

  quiet: false,
  debug_load_units: false,
  debug_rtti: false,

  $res : {},

  debug: function(){
    if (rtl.quiet || !console || !console.log) return;
    console.log(arguments);
  },

  error: function(s){
    rtl.debug('Error: ',s);
    throw s;
  },

  warn: function(s){
    rtl.debug('Warn: ',s);
  },

  checkVersion: function(v){
    if (rtl.version != v) throw "expected rtl version "+v+", but found "+rtl.version;
  },

  hiInt: Math.pow(2,53),

  hasString: function(s){
    return rtl.isString(s) && (s.length>0);
  },

  isArray: function(a) {
    return Array.isArray(a);
  },

  isFunction: function(f){
    return typeof(f)==="function";
  },

  isModule: function(m){
    return rtl.isObject(m) && rtl.hasString(m.$name) && (pas[m.$name]===m);
  },

  isImplementation: function(m){
    return rtl.isObject(m) && rtl.isModule(m.$module) && (m.$module.$impl===m);
  },

  isNumber: function(n){
    return typeof(n)==="number";
  },

  isObject: function(o){
    var s=typeof(o);
    return (typeof(o)==="object") && (o!=null);
  },

  isString: function(s){
    return typeof(s)==="string";
  },

  getNumber: function(n){
    return typeof(n)==="number"?n:NaN;
  },

  getChar: function(c){
    return ((typeof(c)==="string") && (c.length===1)) ? c : "";
  },

  getObject: function(o){
    return ((typeof(o)==="object") || (typeof(o)==='function')) ? o : null;
  },

  isTRecord: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$new') && (typeof(type.$new)==='function'));
  },

  isPasClass: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$classname') && rtl.isObject(type.$module));
  },

  isPasClassInstance: function(type){
    return (rtl.isObject(type) && rtl.isPasClass(type.$class));
  },

  hexStr: function(n,digits){
    return ("000000000000000"+n.toString(16).toUpperCase()).slice(-digits);
  },

  m_loading: 0,
  m_loading_intf: 1,
  m_intf_loaded: 2,
  m_loading_impl: 3, // loading all used unit
  m_initializing: 4, // running initialization
  m_initialized: 5,

  module: function(module_name, intfuseslist, intfcode, impluseslist){
    if (rtl.debug_load_units) rtl.debug('rtl.module name="'+module_name+'" intfuses='+intfuseslist+' impluses='+impluseslist);
    if (!rtl.hasString(module_name)) rtl.error('invalid module name "'+module_name+'"');
    if (!rtl.isArray(intfuseslist)) rtl.error('invalid interface useslist of "'+module_name+'"');
    if (!rtl.isFunction(intfcode)) rtl.error('invalid interface code of "'+module_name+'"');
    if (!(impluseslist==undefined) && !rtl.isArray(impluseslist)) rtl.error('invalid implementation useslist of "'+module_name+'"');

    if (pas[module_name])
      rtl.error('module "'+module_name+'" is already registered');

    var r = Object.create(rtl.tSectionRTTI);
    var module = r.$module = pas[module_name] = {
      $name: module_name,
      $intfuseslist: intfuseslist,
      $impluseslist: impluseslist,
      $state: rtl.m_loading,
      $intfcode: intfcode,
      $implcode: null,
      $impl: null,
      $rtti: r
    };
    if (impluseslist) module.$impl = {
          $module: module,
          $rtti: r
        };
  },

  exitcode: 0,

  run: function(module_name){
    try {
      if (!rtl.hasString(module_name)) module_name='program';
      if (rtl.debug_load_units) rtl.debug('rtl.run module="'+module_name+'"');
      rtl.initRTTI();
      var module = pas[module_name];
      if (!module) rtl.error('rtl.run module "'+module_name+'" missing');
      rtl.loadintf(module);
      rtl.loadimpl(module);
      if ((module_name=='program') || (module_name=='library')){
        if (rtl.debug_load_units) rtl.debug('running $main');
        var r = pas[module_name].$main();
        if (rtl.isNumber(r)) rtl.exitcode = r;
      }
    } catch(re) {
      if (!rtl.showUncaughtExceptions) {
        throw re
      } else {  
        if (!rtl.handleUncaughtException(re)) {
          rtl.showException(re);
          rtl.exitcode = 216;
        }  
      }
    } 
    return rtl.exitcode;
  },
  
  showException : function (re) {
    var errMsg = rtl.hasString(re.$classname) ? re.$classname : '';
    errMsg +=  ((errMsg) ? ': ' : '') + (re.hasOwnProperty('fMessage') ? re.fMessage : re);
    alert('Uncaught Exception : '+errMsg);
  },

  handleUncaughtException: function (e) {
    if (rtl.onUncaughtException) {
      try {
        rtl.onUncaughtException(e);
        return true;
      } catch (ee) {
        return false; 
      }
    } else {
      return false;
    }
  },

  loadintf: function(module){
    if (module.$state>rtl.m_loading_intf) return; // already finished
    if (rtl.debug_load_units) rtl.debug('loadintf: "'+module.$name+'"');
    if (module.$state===rtl.m_loading_intf)
      rtl.error('unit cycle detected "'+module.$name+'"');
    module.$state=rtl.m_loading_intf;
    // load interfaces of interface useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadintf);
    // run interface
    if (rtl.debug_load_units) rtl.debug('loadintf: run intf of "'+module.$name+'"');
    module.$intfcode(module.$intfuseslist);
    // success
    module.$state=rtl.m_intf_loaded;
    // Note: units only used in implementations are not yet loaded (not even their interfaces)
  },

  loaduseslist: function(module,useslist,f){
    if (useslist==undefined) return;
    var len = useslist.length;
    for (var i = 0; i<len; i++) {
      var unitname=useslist[i];
      if (rtl.debug_load_units) rtl.debug('loaduseslist of "'+module.$name+'" uses="'+unitname+'"');
      if (pas[unitname]==undefined)
        rtl.error('module "'+module.$name+'" misses "'+unitname+'"');
      f(pas[unitname]);
    }
  },

  loadimpl: function(module){
    if (module.$state>=rtl.m_loading_impl) return; // already processing
    if (module.$state<rtl.m_intf_loaded) rtl.error('loadimpl: interface not loaded of "'+module.$name+'"');
    if (rtl.debug_load_units) rtl.debug('loadimpl: load uses of "'+module.$name+'"');
    module.$state=rtl.m_loading_impl;
    // load interfaces of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadintf);
    // load implementation of interfaces useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadimpl);
    // load implementation of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadimpl);
    // Note: At this point all interfaces used by this unit are loaded. If
    //   there are implementation uses cycles some used units might not yet be
    //   initialized. This is by design.
    // run implementation
    if (rtl.debug_load_units) rtl.debug('loadimpl: run impl of "'+module.$name+'"');
    if (rtl.isFunction(module.$implcode)) module.$implcode(module.$impluseslist);
    // run initialization
    if (rtl.debug_load_units) rtl.debug('loadimpl: run init of "'+module.$name+'"');
    module.$state=rtl.m_initializing;
    if (rtl.isFunction(module.$init)) module.$init();
    // unit initialized
    module.$state=rtl.m_initialized;
  },

  createCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        return scope[fn].apply(scope,arguments);
      };
    } else {
      cb = function(){
        return fn.apply(scope,arguments);
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  createSafeCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        try{
          return scope[fn].apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    } else {
      cb = function(){
        try{
          return fn.apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  eqCallback: function(a,b){
    // can be a function or a function wrapper
    if (a===b){
      return true;
    } else {
      return (a!=null) && (b!=null) && (a.fn) && (a.scope===b.scope) && (a.fn===b.fn);
    }
  },

  initStruct: function(c,parent,name){
    if ((parent.$module) && (parent.$module.$impl===parent)) parent=parent.$module;
    c.$parent = parent;
    if (rtl.isModule(parent)){
      c.$module = parent;
      c.$name = name;
    } else {
      c.$module = parent.$module;
      c.$name = parent.$name+'.'+name;
    };
    return parent;
  },

  initClass: function(c,parent,name,initfn,rttiname){
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    if (rtl.debug_rtti) rtl.debug('initClass '+c.$fullname);
    var t = c.$module.$rtti.$Class(c.$classname,{ "class": c });
    c.$rtti = t;
    if (rtl.isObject(c.$ancestor)) t.ancestor = c.$ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  createClass: function(parent,name,ancestor,initfn,rttiname){
    // create a normal class,
    // ancestor must be null or a normal class,
    // the root ancestor can be an external class
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // Note:
      // if root is an "object" then c.$ancestor === Object.getPrototypeOf(c)
      // if root is a "function" then c.$ancestor === c.__proto__, Object.getPrototypeOf(c) returns the root
    } else {
      c = { $ancestor: null };
      c.$create = function(fn,args){
        if (args == undefined) args = [];
        var o = Object.create(this);
        o.$init();
        try{
          if (typeof(fn)==="string"){
            o[fn].apply(o,args);
          } else {
            fn.apply(o,args);
          };
          o.AfterConstruction();
        } catch($e){
          // do not call BeforeDestruction
          if (o.Destroy) o.Destroy();
          o.$final();
          throw $e;
        }
        return o;
      };
      c.$destroy = function(fnname){
        this.BeforeDestruction();
        if (this[fnname]) this[fnname]();
        this.$final();
      };
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
  },

  createClassExt: function(parent,name,ancestor,newinstancefnname,initfn,rttiname){
    // Create a class using an external ancestor.
    // If newinstancefnname is given, use that function to create the new object.
    // If exist call BeforeDestruction and AfterConstruction.
    var isFunc = rtl.isFunction(ancestor);
    var c = null;
    if (isFunc){
      // create pascal class descendent from JS function
      c = Object.create(ancestor.prototype);
      c.$ancestorfunc = ancestor;
      c.$ancestor = null; // no pascal ancestor
    } else if (ancestor.$func){
      // create pascal class descendent from a pascal class descendent of a JS function
      isFunc = true;
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
    } else {
      c = Object.create(ancestor);
      c.$ancestor = null; // no pascal ancestor
    }
    c.$create = function(fn,args){
      if (args == undefined) args = [];
      var o = null;
      if (newinstancefnname.length>0){
        o = this[newinstancefnname](fn,args);
      } else if(isFunc) {
        o = new this.$func(args);
      } else {
        o = Object.create(c);
      }
      if (o.$init) o.$init();
      try{
        if (typeof(fn)==="string"){
          this[fn].apply(o,args);
        } else {
          fn.apply(o,args);
        };
        if (o.AfterConstruction) o.AfterConstruction();
      } catch($e){
        // do not call BeforeDestruction
        if (o.Destroy) o.Destroy();
        if (o.$final) o.$final();
        throw $e;
      }
      return o;
    };
    c.$destroy = function(fnname){
      if (this.BeforeDestruction) this.BeforeDestruction();
      if (this[fnname]) this[fnname]();
      if (this.$final) this.$final();
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
    if (isFunc){
      function f(){}
      f.prototype = c;
      c.$func = f;
    }
  },

  createHelper: function(parent,name,ancestor,initfn,rttiname){
    // create a helper,
    // ancestor must be null or a helper,
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // c.$ancestor === Object.getPrototypeOf(c)
    } else {
      c = { $ancestor: null };
    };
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    var t = c.$module.$rtti.$Helper(c.$classname,{ "helper": c });
    c.$rtti = t;
    if (rtl.isObject(ancestor)) t.ancestor = ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  tObjectDestroy: "Destroy",

  free: function(obj,name){
    if (obj[name]==null) return null;
    obj[name].$destroy(rtl.tObjectDestroy);
    obj[name]=null;
  },

  freeLoc: function(obj){
    if (obj==null) return null;
    obj.$destroy(rtl.tObjectDestroy);
    return null;
  },

  hideProp: function(o,p,v){
    Object.defineProperty(o,p, {
      enumerable: false,
      configurable: true,
      writable: true
    });
    if(arguments.length>2){ o[p]=v; }
  },

  recNewT: function(parent,name,initfn,full){
    // create new record type
    var t = {};
    if (parent) parent[name] = t;
    var h = rtl.hideProp;
    if (full){
      rtl.initStruct(t,parent,name);
      t.$record = t;
      h(t,'$record');
      h(t,'$name');
      h(t,'$parent');
      h(t,'$module');
      h(t,'$initSpec');
    }
    initfn.call(t);
    if (!t.$new){
      t.$new = function(){ return Object.create(t); };
    }
    t.$clone = function(r){ return t.$new().$assign(r); };
    h(t,'$new');
    h(t,'$clone');
    h(t,'$eq');
    h(t,'$assign');
    return t;
  },

  is: function(instance,type){
    return type.isPrototypeOf(instance) || (instance===type);
  },

  isExt: function(instance,type,mode){
    // mode===1 means instance must be a Pascal class instance
    // mode===2 means instance must be a Pascal class
    // Notes:
    // isPrototypeOf and instanceof return false on equal
    // isPrototypeOf does not work for Date.isPrototypeOf(new Date())
    //   so if isPrototypeOf is false test with instanceof
    // instanceof needs a function on right side
    if (instance == null) return false; // Note: ==null checks for undefined too
    if ((typeof(type) !== 'object') && (typeof(type) !== 'function')) return false;
    if (instance === type){
      if (mode===1) return false;
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if (type.isPrototypeOf && type.isPrototypeOf(instance)){
      if (mode===1) return rtl.isPasClassInstance(instance);
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if ((typeof type == 'function') && (instance instanceof type)) return true;
    return false;
  },

  Exception: null,
  EInvalidCast: null,
  EAbstractError: null,
  ERangeError: null,
  EIntOverflow: null,
  EPropWriteOnly: null,

  raiseE: function(typename){
    var t = rtl[typename];
    if (t==null){
      var mod = pas.SysUtils;
      if (!mod) mod = pas.sysutils;
      if (mod){
        t = mod[typename];
        if (!t) t = mod[typename.toLowerCase()];
        if (!t) t = mod['Exception'];
        if (!t) t = mod['exception'];
      }
    }
    if (t){
      if (t.Create){
        throw t.$create("Create");
      } else if (t.create){
        throw t.$create("create");
      }
    }
    if (typename === "EInvalidCast") throw "invalid type cast";
    if (typename === "EAbstractError") throw "Abstract method called";
    if (typename === "ERangeError") throw "range error";
    throw typename;
  },

  as: function(instance,type){
    if((instance === null) || rtl.is(instance,type)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  asExt: function(instance,type,mode){
    if((instance === null) || rtl.isExt(instance,type,mode)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  createInterface: function(module, name, guid, fnnames, ancestor, initfn){
    //console.log('createInterface name="'+name+'" guid="'+guid+'" names='+fnnames);
    var i = ancestor?Object.create(ancestor):{};
    module[name] = i;
    i.$module = module;
    i.$name = name;
    i.$fullname = module.$name+'.'+name;
    i.$guid = guid;
    i.$guidr = null;
    i.$names = fnnames?fnnames:[];
    if (rtl.isFunction(initfn)){
      // rtti
      if (rtl.debug_rtti) rtl.debug('createInterface '+i.$fullname);
      var t = i.$module.$rtti.$Interface(name,{ "interface": i, module: module });
      i.$rtti = t;
      if (ancestor) t.ancestor = ancestor.$rtti;
      if (!t.ancestor) t.ancestor = null;
      initfn.call(i);
    }
    return i;
  },

  strToGUIDR: function(s,g){
    var p = 0;
    function n(l){
      var h = s.substr(p,l);
      p+=l;
      return parseInt(h,16);
    }
    p+=1; // skip {
    g.D1 = n(8);
    p+=1; // skip -
    g.D2 = n(4);
    p+=1; // skip -
    g.D3 = n(4);
    p+=1; // skip -
    if (!g.D4) g.D4=[];
    g.D4[0] = n(2);
    g.D4[1] = n(2);
    p+=1; // skip -
    for(var i=2; i<8; i++) g.D4[i] = n(2);
    return g;
  },

  guidrToStr: function(g){
    if (g.$intf) return g.$intf.$guid;
    var h = rtl.hexStr;
    var s='{'+h(g.D1,8)+'-'+h(g.D2,4)+'-'+h(g.D3,4)+'-'+h(g.D4[0],2)+h(g.D4[1],2)+'-';
    for (var i=2; i<8; i++) s+=h(g.D4[i],2);
    s+='}';
    return s;
  },

  createTGUID: function(guid){
    var TGuid = (pas.System)?pas.System.TGuid:pas.system.tguid;
    var g = rtl.strToGUIDR(guid,TGuid.$new());
    return g;
  },

  getIntfGUIDR: function(intfTypeOrVar){
    if (!intfTypeOrVar) return null;
    if (!intfTypeOrVar.$guidr){
      var g = rtl.createTGUID(intfTypeOrVar.$guid);
      if (!intfTypeOrVar.hasOwnProperty('$guid')) intfTypeOrVar = Object.getPrototypeOf(intfTypeOrVar);
      g.$intf = intfTypeOrVar;
      intfTypeOrVar.$guidr = g;
    }
    return intfTypeOrVar.$guidr;
  },

  addIntf: function (aclass, intf, map){
    function jmp(fn){
      if (typeof(fn)==="function"){
        return function(){ return fn.apply(this.$o,arguments); };
      } else {
        return function(){ rtl.raiseE('EAbstractError'); };
      }
    }
    if(!map) map = {};
    var t = intf;
    var item = Object.create(t);
    if (!aclass.hasOwnProperty('$intfmaps')) aclass.$intfmaps = {};
    aclass.$intfmaps[intf.$guid] = item;
    do{
      var names = t.$names;
      if (!names) break;
      for (var i=0; i<names.length; i++){
        var intfname = names[i];
        var fnname = map[intfname];
        if (!fnname) fnname = intfname;
        //console.log('addIntf: intftype='+t.$name+' index='+i+' intfname="'+intfname+'" fnname="'+fnname+'" old='+typeof(item[intfname]));
        item[intfname] = jmp(aclass[fnname]);
      }
      t = Object.getPrototypeOf(t);
    }while(t!=null);
  },

  getIntfG: function (obj, guid, query){
    if (!obj) return null;
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query);
    // search
    var maps = obj.$intfmaps;
    if (!maps) return null;
    var item = maps[guid];
    if (!item) return null;
    // check delegation
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query+' item='+typeof(item));
    if (typeof item === 'function') return item.call(obj); // delegate. Note: COM contains _AddRef
    // check cache
    var intf = null;
    if (obj.$interfaces){
      intf = obj.$interfaces[guid];
      //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' cache='+typeof(intf));
    }
    if (!intf){ // intf can be undefined!
      intf = Object.create(item);
      intf.$o = obj;
      if (!obj.$interfaces) obj.$interfaces = {};
      obj.$interfaces[guid] = intf;
    }
    if (typeof(query)==='object'){
      // called by queryIntfT
      var o = null;
      if (intf.QueryInterface(rtl.getIntfGUIDR(query),
          {get:function(){ return o; }, set:function(v){ o=v; }}) === 0){
        return o;
      } else {
        return null;
      }
    } else if(query===2){
      // called by TObject.GetInterfaceByStr
      if (intf.$kind === 'com') intf._AddRef();
    }
    return intf;
  },

  getIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid);
  },

  queryIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid,intftype);
  },

  queryIntfIsT: function(obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (!i) return false;
    if (i.$kind === 'com') i._Release();
    return true;
  },

  asIntfT: function (obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (i!==null) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsIntfT: function(intf,intftype){
    return (intf!==null) && rtl.queryIntfIsT(intf.$o,intftype);
  },

  intfAsIntfT: function (intf,intftype){
    if (!intf) return null;
    var i = rtl.getIntfG(intf.$o,intftype.$guid);
    if (i) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsClass: function(intf,classtype){
    return (intf!=null) && (rtl.is(intf.$o,classtype));
  },

  intfAsClass: function(intf,classtype){
    if (intf==null) return null;
    return rtl.as(intf.$o,classtype);
  },

  intfToClass: function(intf,classtype){
    if ((intf!==null) && rtl.is(intf.$o,classtype)) return intf.$o;
    return null;
  },

  // interface reference counting
  intfRefs: { // base object for temporary interface variables
    ref: function(id,intf){
      // called for temporary interface references needing delayed release
      var old = this[id];
      //console.log('rtl.intfRefs.ref: id='+id+' old="'+(old?old.$name:'null')+'" intf="'+(intf?intf.$name:'null')+' $o='+(intf?intf.$o:'null'));
      if (old){
        // called again, e.g. in a loop
        delete this[id];
        old._Release(); // may fail
      }
      if(intf) {
        this[id]=intf;
      }
      return intf;
    },
    free: function(){
      //console.log('rtl.intfRefs.free...');
      for (var id in this){
        if (this.hasOwnProperty(id)){
          var intf = this[id];
          if (intf){
            //console.log('rtl.intfRefs.free: id='+id+' '+intf.$name+' $o='+intf.$o.$classname);
            intf._Release();
          }
        }
      }
    }
  },

  createIntfRefs: function(){
    //console.log('rtl.createIntfRefs');
    return Object.create(rtl.intfRefs);
  },

  setIntfP: function(path,name,value,skipAddRef){
    var old = path[name];
    //console.log('rtl.setIntfP path='+path+' name='+name+' old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old === value) return;
    if (old !== null){
      path[name]=null;
      old._Release();
    }
    if (value !== null){
      if (!skipAddRef) value._AddRef();
      path[name]=value;
    }
  },

  setIntfL: function(old,value,skipAddRef){
    //console.log('rtl.setIntfL old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old !== value){
      if (value!==null){
        if (!skipAddRef) value._AddRef();
      }
      if (old!==null){
        old._Release();  // Release after AddRef, to avoid double Release if Release creates an exception
      }
    } else if (skipAddRef){
      if (old!==null){
        old._Release();  // value has an AddRef
      }
    }
    return value;
  },

  _AddRef: function(intf){
    //if (intf) console.log('rtl._AddRef intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._AddRef();
    return intf;
  },

  _Release: function(intf){
    //if (intf) console.log('rtl._Release intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._Release();
    return intf;
  },

  trunc: function(a){
    return a<0 ? Math.ceil(a) : Math.floor(a);
  },

  checkMethodCall: function(obj,type){
    if (rtl.isObject(obj) && rtl.is(obj,type)) return;
    rtl.raiseE("EInvalidCast");
  },

  oc: function(i){
    // overflow check integer
    if ((Math.floor(i)===i) && (i>=-0x1fffffffffffff) && (i<=0x1fffffffffffff)) return i;
    rtl.raiseE('EIntOverflow');
  },

  rc: function(i,minval,maxval){
    // range check integer
    if ((Math.floor(i)===i) && (i>=minval) && (i<=maxval)) return i;
    rtl.raiseE('ERangeError');
  },

  rcc: function(c,minval,maxval){
    // range check char
    if ((typeof(c)==='string') && (c.length===1)){
      var i = c.charCodeAt(0);
      if ((i>=minval) && (i<=maxval)) return c;
    }
    rtl.raiseE('ERangeError');
  },

  rcSetCharAt: function(s,index,c){
    // range check setCharAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return rtl.setCharAt(s,index,c);
  },

  rcCharAt: function(s,index){
    // range check charAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return s.charAt(index);
  },

  rcArrR: function(arr,index){
    // range check read array
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      if (arguments.length>2){
        // arr,index1,index2,...
        arr=arr[index];
        for (var i=2; i<arguments.length; i++) arr=rtl.rcArrR(arr,arguments[i]);
        return arr;
      }
      return arr[index];
    }
    rtl.raiseE('ERangeError');
  },

  rcArrW: function(arr,index,value){
    // range check write array
    // arr,index1,index2,...,value
    for (var i=3; i<arguments.length; i++){
      arr=rtl.rcArrR(arr,index);
      index=arguments[i-1];
      value=arguments[i];
    }
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      return arr[index]=value;
    }
    rtl.raiseE('ERangeError');
  },

  length: function(arr){
    return (arr == null) ? 0 : arr.length;
  },

  arrayRef: function(a){
    if (a!=null) rtl.hideProp(a,'$pas2jsrefcnt',1);
    return a;
  },

  arraySetLength: function(arr,defaultvalue,newlength){
    var stack = [];
    var s = 9999;
    for (var i=2; i<arguments.length; i++){
      var j = arguments[i];
      if (j==='s'){ s = i-2; }
      else {
        stack.push({ dim:j+0, a:null, i:0, src:null });
      }
    }
    var dimmax = stack.length-1;
    var depth = 0;
    var lastlen = 0;
    var item = null;
    var a = null;
    var src = arr;
    var srclen = 0, oldlen = 0;
    do{
      if (depth>0){
        item=stack[depth-1];
        src = (item.src && item.src.length>item.i)?item.src[item.i]:null;
      }
      if (!src){
        a = [];
        srclen = 0;
        oldlen = 0;
      } else if (src.$pas2jsrefcnt>0 || depth>=s){
        a = [];
        srclen = src.length;
        oldlen = srclen;
      } else {
        a = src;
        srclen = 0;
        oldlen = a.length;
      }
      lastlen = stack[depth].dim;
      a.length = lastlen;
      if (depth>0){
        item.a[item.i]=a;
        item.i++;
        if ((lastlen===0) && (item.i<item.a.length)) continue;
      }
      if (lastlen>0){
        if (depth<dimmax){
          item = stack[depth];
          item.a = a;
          item.i = 0;
          item.src = src;
          depth++;
          continue;
        } else {
          if (srclen>lastlen) srclen=lastlen;
          if (rtl.isArray(defaultvalue)){
            // array of dyn array
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<lastlen; i++) a[i]=[];
          } else if (rtl.isObject(defaultvalue)) {
            if (rtl.isTRecord(defaultvalue)){
              // array of record
              for (var i=0; i<srclen; i++) a[i]=defaultvalue.$clone(src[i]);
              for (var i=oldlen; i<lastlen; i++) a[i]=defaultvalue.$new();
            } else {
              // array of set
              for (var i=0; i<srclen; i++) a[i]=rtl.refSet(src[i]);
              for (var i=oldlen; i<lastlen; i++) a[i]={};
            }
          } else {
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<lastlen; i++) a[i]=defaultvalue;
          }
        }
      }
      // backtrack
      while ((depth>0) && (stack[depth-1].i>=stack[depth-1].dim)){
        depth--;
      };
      if (depth===0){
        if (dimmax===0) return a;
        return stack[0].a;
      }
    }while (true);
  },

  arrayEq: function(a,b){
    if (a===null) return b===null;
    if (b===null) return false;
    if (a.length!==b.length) return false;
    for (var i=0; i<a.length; i++) if (a[i]!==b[i]) return false;
    return true;
  },

  arrayClone: function(type,src,srcpos,endpos,dst,dstpos){
    // type: 0 for references, "refset" for calling refSet(), a function for new type()
    // src must not be null
    // This function does not range check.
    if(type === 'refSet') {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = rtl.refSet(src[srcpos]); // ref set
    } else if (rtl.isTRecord(type)){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = type.$clone(src[srcpos]); // clone record
    }  else {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = src[srcpos]; // reference
    };
  },

  arrayConcat: function(type){
    // type: see rtl.arrayClone
    var a = [];
    var l = 0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src !== null) l+=src.length;
    };
    a.length = l;
    l=0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      rtl.arrayClone(type,src,0,src.length,a,l);
      l+=src.length;
    };
    return a;
  },

  arrayConcatN: function(){
    var a = null;
    for (var i=0; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      if (a===null){
        a=rtl.arrayRef(src); // Note: concat(a) does not clone
      } else {
        a=a.concat(src);
      }
    };
    return a;
  },

  arrayCopy: function(type, srcarray, index, count){
    // type: see rtl.arrayClone
    // if count is missing, use srcarray.length
    if (srcarray === null) return [];
    if (index < 0) index = 0;
    if (count === undefined) count=srcarray.length;
    var end = index+count;
    if (end>srcarray.length) end = srcarray.length;
    if (index>=end) return [];
    if (type===0){
      return srcarray.slice(index,end);
    } else {
      var a = [];
      a.length = end-index;
      rtl.arrayClone(type,srcarray,index,end,a,0);
      return a;
    }
  },

  arrayInsert: function(item, arr, index){
    if (arr){
      arr.splice(index,0,item);
      return arr;
    } else {
      return [item];
    }
  },

  setCharAt: function(s,index,c){
    return s.substr(0,index)+c+s.substr(index+1);
  },

  getResStr: function(mod,name){
    var rs = mod.$resourcestrings[name];
    return rs.current?rs.current:rs.org;
  },

  createSet: function(){
    var s = {};
    for (var i=0; i<arguments.length; i++){
      if (arguments[i]!=null){
        s[arguments[i]]=true;
      } else {
        var first=arguments[i+=1];
        var last=arguments[i+=1];
        for(var j=first; j<=last; j++) s[j]=true;
      }
    }
    return s;
  },

  cloneSet: function(s){
    var r = {};
    for (var key in s) r[key]=true;
    return r;
  },

  refSet: function(s){
    rtl.hideProp(s,'$shared',true);
    return s;
  },

  includeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    s[enumvalue] = true;
    return s;
  },

  excludeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    delete s[enumvalue];
    return s;
  },

  diffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    return r;
  },

  unionSet: function(s,t){
    var r = {};
    for (var key in s) r[key]=true;
    for (var key in t) r[key]=true;
    return r;
  },

  intersectSet: function(s,t){
    var r = {};
    for (var key in s) if (t[key]) r[key]=true;
    return r;
  },

  symDiffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    for (var key in t) if (!s[key]) r[key]=true;
    return r;
  },

  eqSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  neSet: function(s,t){
    return !rtl.eqSet(s,t);
  },

  leSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    return true;
  },

  geSet: function(s,t){
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  strSetLength: function(s,newlen){
    var oldlen = s.length;
    if (oldlen > newlen){
      return s.substring(0,newlen);
    } else if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return s+' '.repeat(newlen-oldlen);
    } else {
       while (oldlen<newlen){
         s+=' ';
         oldlen++;
       };
       return s;
    }
  },

  spaceLeft: function(s,width){
    var l=s.length;
    if (l>=width) return s;
    if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return ' '.repeat(width-l) + s;
    } else {
      while (l<width){
        s=' '+s;
        l++;
      };
      return s;
    };
  },

  floatToStr: function(d,w,p){
    // input 1-3 arguments: double, width, precision
    if (arguments.length>2){
      return rtl.spaceLeft(d.toFixed(p),w);
    } else {
	  // exponent width
	  var pad = "";
	  var ad = Math.abs(d);
	  if (((ad>1) && (ad<1.0e+10)) ||  ((ad>1.e-10) && (ad<1))) {
		pad='00';
	  } else if ((ad>1) && (ad<1.0e+100) || (ad<1.e-10)) {
		pad='0';
      }  	
	  if (arguments.length<2) {
	    w=24;		
      } else if (w<9) {
		w=9;
      }		  
      var p = w-8;
      var s=(d>0 ? " " : "" ) + d.toExponential(p);
      s=s.replace(/e(.)/,'E$1'+pad);
      return rtl.spaceLeft(s,w);
    }
  },

  valEnum: function(s, enumType, setCodeFn){
    s = s.toLowerCase();
    for (var key in enumType){
      if((typeof(key)==='string') && (key.toLowerCase()===s)){
        setCodeFn(0);
        return enumType[key];
      }
    }
    setCodeFn(1);
    return 0;
  },

  lw: function(l){
    // fix longword bitwise operation
    return l<0?l+0x100000000:l;
  },

  and: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) & (b / hi);
    var l = (a & low) & (b & low);
    return h*hi + l;
  },

  or: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) | (b / hi);
    var l = (a & low) | (b & low);
    return h*hi + l;
  },

  xor: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) ^ (b / hi);
    var l = (a & low) ^ (b & low);
    return h*hi + l;
  },

  shr: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (a<0x80000000) return a >> b;
    if (b<=0) return a;
    if (b>54) return 0;
    return Math.floor(a / Math.pow(2,b));
  },

  shl: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (b<=0) return a;
    if (b>54) return 0;
    var r = a * Math.pow(2,b);
    if (r <= rtl.hiInt) return r;
    return r % rtl.hiInt;
  },

  initRTTI: function(){
    if (rtl.debug_rtti) rtl.debug('initRTTI');

    // base types
    rtl.tTypeInfo = { name: "tTypeInfo", kind: 0, $module: null, attr: null };
    function newBaseTI(name,kind,ancestor){
      if (!ancestor) ancestor = rtl.tTypeInfo;
      if (rtl.debug_rtti) rtl.debug('initRTTI.newBaseTI "'+name+'" '+kind+' ("'+ancestor.name+'")');
      var t = Object.create(ancestor);
      t.name = name;
      t.kind = kind;
      rtl[name] = t;
      return t;
    };
    function newBaseInt(name,minvalue,maxvalue,ordtype){
      var t = newBaseTI(name,1 /* tkInteger */,rtl.tTypeInfoInteger);
      t.minvalue = minvalue;
      t.maxvalue = maxvalue;
      t.ordtype = ordtype;
      return t;
    };
    newBaseTI("tTypeInfoInteger",1 /* tkInteger */);
    newBaseInt("shortint",-0x80,0x7f,0);
    newBaseInt("byte",0,0xff,1);
    newBaseInt("smallint",-0x8000,0x7fff,2);
    newBaseInt("word",0,0xffff,3);
    newBaseInt("longint",-0x80000000,0x7fffffff,4);
    newBaseInt("longword",0,0xffffffff,5);
    newBaseInt("nativeint",-0x10000000000000,0xfffffffffffff,6);
    newBaseInt("nativeuint",0,0xfffffffffffff,7);
    newBaseTI("char",2 /* tkChar */);
    newBaseTI("string",3 /* tkString */);
    newBaseTI("tTypeInfoEnum",4 /* tkEnumeration */,rtl.tTypeInfoInteger);
    newBaseTI("tTypeInfoSet",5 /* tkSet */);
    newBaseTI("double",6 /* tkDouble */);
    newBaseTI("boolean",7 /* tkBool */);
    newBaseTI("tTypeInfoProcVar",8 /* tkProcVar */);
    newBaseTI("tTypeInfoMethodVar",9 /* tkMethod */,rtl.tTypeInfoProcVar);
    newBaseTI("tTypeInfoArray",10 /* tkArray */);
    newBaseTI("tTypeInfoDynArray",11 /* tkDynArray */);
    newBaseTI("tTypeInfoPointer",15 /* tkPointer */);
    var t = newBaseTI("pointer",15 /* tkPointer */,rtl.tTypeInfoPointer);
    t.reftype = null;
    newBaseTI("jsvalue",16 /* tkJSValue */);
    newBaseTI("tTypeInfoRefToProcVar",17 /* tkRefToProcVar */,rtl.tTypeInfoProcVar);

    // member kinds
    rtl.tTypeMember = { attr: null };
    function newMember(name,kind){
      var m = Object.create(rtl.tTypeMember);
      m.name = name;
      m.kind = kind;
      rtl[name] = m;
    };
    newMember("tTypeMemberField",1); // tmkField
    newMember("tTypeMemberMethod",2); // tmkMethod
    newMember("tTypeMemberProperty",3); // tmkProperty

    // base object for storing members: a simple object
    rtl.tTypeMembers = {};

    // tTypeInfoStruct - base object for tTypeInfoClass, tTypeInfoRecord, tTypeInfoInterface
    var tis = newBaseTI("tTypeInfoStruct",0);
    tis.$addMember = function(name,ancestor,options){
      if (rtl.debug_rtti){
        if (!rtl.hasString(name) || (name.charAt()==='$')) throw 'invalid member "'+name+'", this="'+this.name+'"';
        if (!rtl.is(ancestor,rtl.tTypeMember)) throw 'invalid ancestor "'+ancestor+':'+ancestor.name+'", "'+this.name+'.'+name+'"';
        if ((options!=undefined) && (typeof(options)!='object')) throw 'invalid options "'+options+'", "'+this.name+'.'+name+'"';
      };
      var t = Object.create(ancestor);
      t.name = name;
      this.members[name] = t;
      this.names.push(name);
      if (rtl.isObject(options)){
        for (var key in options) if (options.hasOwnProperty(key)) t[key] = options[key];
      };
      return t;
    };
    tis.addField = function(name,type,options){
      var t = this.$addMember(name,rtl.tTypeMemberField,options);
      if (rtl.debug_rtti){
        if (!rtl.is(type,rtl.tTypeInfo)) throw 'invalid type "'+type+'", "'+this.name+'.'+name+'"';
      };
      t.typeinfo = type;
      this.fields.push(name);
      return t;
    };
    tis.addFields = function(){
      var i=0;
      while(i<arguments.length){
        var name = arguments[i++];
        var type = arguments[i++];
        if ((i<arguments.length) && (typeof(arguments[i])==='object')){
          this.addField(name,type,arguments[i++]);
        } else {
          this.addField(name,type);
        };
      };
    };
    tis.addMethod = function(name,methodkind,params,result,flags,options){
      var t = this.$addMember(name,rtl.tTypeMemberMethod,options);
      t.methodkind = methodkind;
      t.procsig = rtl.newTIProcSig(params,result,flags);
      this.methods.push(name);
      return t;
    };
    tis.addProperty = function(name,flags,result,getter,setter,options){
      var t = this.$addMember(name,rtl.tTypeMemberProperty,options);
      t.flags = flags;
      t.typeinfo = result;
      t.getter = getter;
      t.setter = setter;
      // Note: in options: params, stored, defaultvalue
      t.params = rtl.isArray(t.params) ? rtl.newTIParams(t.params) : null;
      this.properties.push(name);
      if (!rtl.isString(t.stored)) t.stored = "";
      return t;
    };
    tis.getField = function(index){
      return this.members[this.fields[index]];
    };
    tis.getMethod = function(index){
      return this.members[this.methods[index]];
    };
    tis.getProperty = function(index){
      return this.members[this.properties[index]];
    };

    newBaseTI("tTypeInfoRecord",12 /* tkRecord */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClass",13 /* tkClass */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClassRef",14 /* tkClassRef */);
    newBaseTI("tTypeInfoInterface",18 /* tkInterface */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoHelper",19 /* tkHelper */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoExtClass",20 /* tkExtClass */,rtl.tTypeInfoClass);
  },

  tSectionRTTI: {
    $module: null,
    $inherited: function(name,ancestor,o){
      if (rtl.debug_rtti){
        rtl.debug('tSectionRTTI.newTI "'+(this.$module?this.$module.$name:"(no module)")
          +'"."'+name+'" ('+ancestor.name+') '+(o?'init':'forward'));
      };
      var t = this[name];
      if (t){
        if (!t.$forward) throw 'duplicate type "'+name+'"';
        if (!ancestor.isPrototypeOf(t)) throw 'typeinfo ancestor mismatch "'+name+'" ancestor="'+ancestor.name+'" t.name="'+t.name+'"';
      } else {
        t = Object.create(ancestor);
        t.name = name;
        t.$module = this.$module;
        this[name] = t;
      }
      if (o){
        delete t.$forward;
        for (var key in o) if (o.hasOwnProperty(key)) t[key]=o[key];
      } else {
        t.$forward = true;
      }
      return t;
    },
    $Scope: function(name,ancestor,o){
      var t=this.$inherited(name,ancestor,o);
      t.members = {};
      t.names = [];
      t.fields = [];
      t.methods = [];
      t.properties = [];
      return t;
    },
    $TI: function(name,kind,o){ var t=this.$inherited(name,rtl.tTypeInfo,o); t.kind = kind; return t; },
    $Int: function(name,o){ return this.$inherited(name,rtl.tTypeInfoInteger,o); },
    $Enum: function(name,o){ return this.$inherited(name,rtl.tTypeInfoEnum,o); },
    $Set: function(name,o){ return this.$inherited(name,rtl.tTypeInfoSet,o); },
    $StaticArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoArray,o); },
    $DynArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoDynArray,o); },
    $ProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoProcVar,o); },
    $RefToProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoRefToProcVar,o); },
    $MethodVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoMethodVar,o); },
    $Record: function(name,o){ return this.$Scope(name,rtl.tTypeInfoRecord,o); },
    $Class: function(name,o){ return this.$Scope(name,rtl.tTypeInfoClass,o); },
    $ClassRef: function(name,o){ return this.$inherited(name,rtl.tTypeInfoClassRef,o); },
    $Pointer: function(name,o){ return this.$inherited(name,rtl.tTypeInfoPointer,o); },
    $Interface: function(name,o){ return this.$Scope(name,rtl.tTypeInfoInterface,o); },
    $Helper: function(name,o){ return this.$Scope(name,rtl.tTypeInfoHelper,o); },
    $ExtClass: function(name,o){ return this.$Scope(name,rtl.tTypeInfoExtClass,o); }
  },

  newTIParam: function(param){
    // param is an array, 0=name, 1=type, 2=optional flags
    var t = {
      name: param[0],
      typeinfo: param[1],
      flags: (rtl.isNumber(param[2]) ? param[2] : 0)
    };
    return t;
  },

  newTIParams: function(list){
    // list: optional array of [paramname,typeinfo,optional flags]
    var params = [];
    if (rtl.isArray(list)){
      for (var i=0; i<list.length; i++) params.push(rtl.newTIParam(list[i]));
    };
    return params;
  },

  newTIProcSig: function(params,result,flags){
    var s = {
      params: rtl.newTIParams(params),
      resulttype: result?result:null,
      flags: flags?flags:0
    };
    return s;
  },

  addResource: function(aRes){
    rtl.$res[aRes.name]=aRes;
  },

  getResource: function(aName){
    var res = rtl.$res[aName];
    if (res !== undefined) {
      return res;
    } else {
      return null;
    }
  },

  getResourceList: function(){
    return Object.keys(rtl.$res);
  }
}

rtl.module("System",[],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass(this,"TObject",null,function () {
    this.$init = function () {
    };
    this.$final = function () {
    };
    this.AfterConstruction = function () {
    };
    this.BeforeDestruction = function () {
    };
  });
  this.Copy = function (S, Index, Size) {
    if (Index<1) Index = 1;
    return (Size>0) ? S.substring(Index-1,Index+Size-1) : "";
  };
  this.Copy$1 = function (S, Index) {
    if (Index<1) Index = 1;
    return S.substr(Index-1);
  };
  this.Delete = function (S, Index, Size) {
    var h = "";
    if ((Index < 1) || (Index > S.get().length) || (Size <= 0)) return;
    h = S.get();
    S.set($mod.Copy(h,1,Index - 1) + $mod.Copy$1(h,Index + Size));
  };
  this.Pos = function (Search, InString) {
    return InString.indexOf(Search)+1;
  };
  this.Writeln = function () {
    var i = 0;
    var l = 0;
    var s = "";
    l = arguments.length - 1;
    if ($impl.WriteCallBack != null) {
      for (var $l = 0, $end = l; $l <= $end; $l++) {
        i = $l;
        $impl.WriteCallBack(arguments[i],i === l);
      };
    } else {
      s = $impl.WriteBuf;
      for (var $l1 = 0, $end1 = l; $l1 <= $end1; $l1++) {
        i = $l1;
        s = s + ("" + arguments[i]);
      };
      console.log(s);
      $impl.WriteBuf = "";
    };
  };
  $mod.$implcode = function () {
    $impl.WriteBuf = "";
    $impl.WriteCallBack = null;
  };
  $mod.$init = function () {
    rtl.exitcode = 0;
  };
},[]);
rtl.module("Types",["System"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("JS",["System","Types"],function () {
  "use strict";
  var $mod = this;
  this.isDefined = function (v) {
    return !(v == undefined);
  };
});
rtl.module("Web",["System","Types","JS"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TJSKeyNames",pas.System.TObject,function () {
    this.ArrowDown = "ArrowDown";
    this.ArrowLeft = "ArrowLeft";
    this.ArrowRight = "ArrowRight";
  });
});
rtl.module("SysUtils",["System","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.recNewT(this,"TFormatSettings",function () {
    this.CurrencyDecimals = 0;
    this.CurrencyFormat = 0;
    this.CurrencyString = "";
    this.DateSeparator = "";
    this.DecimalSeparator = "";
    this.LongDateFormat = "";
    this.LongTimeFormat = "";
    this.NegCurrFormat = 0;
    this.ShortDateFormat = "";
    this.ShortTimeFormat = "";
    this.ThousandSeparator = "";
    this.TimeAMString = "";
    this.TimePMString = "";
    this.TimeSeparator = "";
    this.TwoDigitYearCenturyWindow = 0;
    this.InitLocaleHandler = null;
    this.$new = function () {
      var r = Object.create(this);
      r.DateTimeToStrFormat = rtl.arraySetLength(null,"",2);
      r.LongDayNames = rtl.arraySetLength(null,"",7);
      r.LongMonthNames = rtl.arraySetLength(null,"",12);
      r.ShortDayNames = rtl.arraySetLength(null,"",7);
      r.ShortMonthNames = rtl.arraySetLength(null,"",12);
      return r;
    };
    this.$eq = function (b) {
      return (this.CurrencyDecimals === b.CurrencyDecimals) && (this.CurrencyFormat === b.CurrencyFormat) && (this.CurrencyString === b.CurrencyString) && (this.DateSeparator === b.DateSeparator) && rtl.arrayEq(this.DateTimeToStrFormat,b.DateTimeToStrFormat) && (this.DecimalSeparator === b.DecimalSeparator) && (this.LongDateFormat === b.LongDateFormat) && rtl.arrayEq(this.LongDayNames,b.LongDayNames) && rtl.arrayEq(this.LongMonthNames,b.LongMonthNames) && (this.LongTimeFormat === b.LongTimeFormat) && (this.NegCurrFormat === b.NegCurrFormat) && (this.ShortDateFormat === b.ShortDateFormat) && rtl.arrayEq(this.ShortDayNames,b.ShortDayNames) && rtl.arrayEq(this.ShortMonthNames,b.ShortMonthNames) && (this.ShortTimeFormat === b.ShortTimeFormat) && (this.ThousandSeparator === b.ThousandSeparator) && (this.TimeAMString === b.TimeAMString) && (this.TimePMString === b.TimePMString) && (this.TimeSeparator === b.TimeSeparator) && (this.TwoDigitYearCenturyWindow === b.TwoDigitYearCenturyWindow);
    };
    this.$assign = function (s) {
      this.CurrencyDecimals = s.CurrencyDecimals;
      this.CurrencyFormat = s.CurrencyFormat;
      this.CurrencyString = s.CurrencyString;
      this.DateSeparator = s.DateSeparator;
      this.DateTimeToStrFormat = s.DateTimeToStrFormat.slice(0);
      this.DecimalSeparator = s.DecimalSeparator;
      this.LongDateFormat = s.LongDateFormat;
      this.LongDayNames = s.LongDayNames.slice(0);
      this.LongMonthNames = s.LongMonthNames.slice(0);
      this.LongTimeFormat = s.LongTimeFormat;
      this.NegCurrFormat = s.NegCurrFormat;
      this.ShortDateFormat = s.ShortDateFormat;
      this.ShortDayNames = s.ShortDayNames.slice(0);
      this.ShortMonthNames = s.ShortMonthNames.slice(0);
      this.ShortTimeFormat = s.ShortTimeFormat;
      this.ThousandSeparator = s.ThousandSeparator;
      this.TimeAMString = s.TimeAMString;
      this.TimePMString = s.TimePMString;
      this.TimeSeparator = s.TimeSeparator;
      this.TwoDigitYearCenturyWindow = s.TwoDigitYearCenturyWindow;
      return this;
    };
    this.GetJSLocale = function () {
      return Intl.DateTimeFormat().resolvedOptions().locale;
    };
    this.Create = function () {
      var Result = $mod.TFormatSettings.$new();
      Result.$assign($mod.TFormatSettings.Create$1($mod.TFormatSettings.GetJSLocale()));
      return Result;
    };
    this.Create$1 = function (ALocale) {
      var Result = $mod.TFormatSettings.$new();
      Result.LongDayNames = $impl.DefaultLongDayNames.slice(0);
      Result.ShortDayNames = $impl.DefaultShortDayNames.slice(0);
      Result.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
      Result.LongMonthNames = $impl.DefaultLongMonthNames.slice(0);
      Result.DateTimeToStrFormat[0] = "c";
      Result.DateTimeToStrFormat[1] = "f";
      Result.DateSeparator = "-";
      Result.TimeSeparator = ":";
      Result.ShortDateFormat = "yyyy-mm-dd";
      Result.LongDateFormat = "ddd, yyyy-mm-dd";
      Result.ShortTimeFormat = "hh:nn";
      Result.LongTimeFormat = "hh:nn:ss";
      Result.DecimalSeparator = ".";
      Result.ThousandSeparator = ",";
      Result.TimeAMString = "AM";
      Result.TimePMString = "PM";
      Result.TwoDigitYearCenturyWindow = 50;
      Result.CurrencyFormat = 0;
      Result.NegCurrFormat = 0;
      Result.CurrencyDecimals = 2;
      Result.CurrencyString = "$";
      if ($mod.TFormatSettings.InitLocaleHandler != null) $mod.TFormatSettings.InitLocaleHandler($mod.UpperCase(ALocale),$mod.TFormatSettings.$clone(Result));
      return Result;
    };
  },true);
  this.UpperCase = function (s) {
    return s.toUpperCase();
  };
  this.LowerCase = function (s) {
    return s.toLowerCase();
  };
  this.SameText = function (s1, s2) {
    return s1.toLowerCase() == s2.toLowerCase();
  };
  this.IntToStr = function (Value) {
    var Result = "";
    Result = "" + Value;
    return Result;
  };
  this.TimeSeparator = "";
  this.DateSeparator = "";
  this.ShortDateFormat = "";
  this.LongDateFormat = "";
  this.ShortTimeFormat = "";
  this.LongTimeFormat = "";
  this.DecimalSeparator = "";
  this.ThousandSeparator = "";
  this.TimeAMString = "";
  this.TimePMString = "";
  this.ShortMonthNames = rtl.arraySetLength(null,"",12);
  this.LongMonthNames = rtl.arraySetLength(null,"",12);
  this.ShortDayNames = rtl.arraySetLength(null,"",7);
  this.LongDayNames = rtl.arraySetLength(null,"",7);
  this.FormatSettings = this.TFormatSettings.$new();
  this.CurrencyFormat = 0;
  this.NegCurrFormat = 0;
  this.CurrencyDecimals = 0;
  this.CurrencyString = "";
  $mod.$implcode = function () {
    $impl.DefaultShortMonthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    $impl.DefaultLongMonthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    $impl.DefaultShortDayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    $impl.DefaultLongDayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  };
  $mod.$init = function () {
    $mod.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
    $mod.LongMonthNames = $impl.DefaultLongMonthNames.slice(0);
    $mod.ShortDayNames = $impl.DefaultShortDayNames.slice(0);
    $mod.LongDayNames = $impl.DefaultLongDayNames.slice(0);
    $mod.FormatSettings.$assign($mod.TFormatSettings.Create());
    $mod.TimeSeparator = $mod.FormatSettings.TimeSeparator;
    $mod.DateSeparator = $mod.FormatSettings.DateSeparator;
    $mod.ShortDateFormat = $mod.FormatSettings.ShortDateFormat;
    $mod.LongDateFormat = $mod.FormatSettings.LongDateFormat;
    $mod.ShortTimeFormat = $mod.FormatSettings.ShortTimeFormat;
    $mod.LongTimeFormat = $mod.FormatSettings.LongTimeFormat;
    $mod.DecimalSeparator = $mod.FormatSettings.DecimalSeparator;
    $mod.ThousandSeparator = $mod.FormatSettings.ThousandSeparator;
    $mod.TimeAMString = $mod.FormatSettings.TimeAMString;
    $mod.TimePMString = $mod.FormatSettings.TimePMString;
    $mod.CurrencyFormat = $mod.FormatSettings.CurrencyFormat;
    $mod.NegCurrFormat = $mod.FormatSettings.NegCurrFormat;
    $mod.CurrencyDecimals = $mod.FormatSettings.CurrencyDecimals;
    $mod.CurrencyString = $mod.FormatSettings.CurrencyString;
  };
},[]);
rtl.module("p2jsres",["System","Types"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.TResourceSource = {"0": "rsJS", rsJS: 0, "1": "rsHTML", rsHTML: 1};
  rtl.recNewT(this,"TResourceInfo",function () {
    this.name = "";
    this.encoding = "";
    this.resourceunit = "";
    this.format = "";
    this.data = "";
    this.$eq = function (b) {
      return (this.name === b.name) && (this.encoding === b.encoding) && (this.resourceunit === b.resourceunit) && (this.format === b.format) && (this.data === b.data);
    };
    this.$assign = function (s) {
      this.name = s.name;
      this.encoding = s.encoding;
      this.resourceunit = s.resourceunit;
      this.format = s.format;
      this.data = s.data;
      return this;
    };
  });
  this.SetResourceSource = function (aSource) {
    var Result = 0;
    Result = $impl.gMode;
    $impl.gMode = aSource;
    return Result;
  };
  this.GetResourceInfo = function (aName, aInfo) {
    var Result = false;
    Result = $mod.GetResourceInfo$1($impl.gMode,aName,aInfo);
    return Result;
  };
  this.GetResourceInfo$1 = function (aSource, aName, aInfo) {
    var Result = false;
    var $tmp = aSource;
    if ($tmp === $mod.TResourceSource.rsJS) {
      Result = $impl.GetRTLResourceInfo(aName,aInfo)}
     else if ($tmp === $mod.TResourceSource.rsHTML) Result = $impl.GetHTMLResourceInfo(aName,aInfo);
    return Result;
  };
  this.LoadHTMLLinkResources = function (aURL, OnLoad, OnError) {
    function FetchOK(Res) {
      var Result = undefined;
      Result = null;
      if (!Res.ok) {
        if (OnError != null) throw new Error("HTTP Error for URL aURL, status = " + pas.SysUtils.IntToStr(Res.status) + " : " + Res.statusText);
      } else Result = Res.text();
      return Result;
    };
    function BlobOK(Res) {
      var Result = undefined;
      var ID = "";
      var Tmpl = null;
      var El = null;
      var Arr = [];
      var aParent = null;
      Result = null;
      aParent = document.head;
      if (aParent === null) aParent = document.body;
      Arr = rtl.arraySetLength(Arr,"",0);
      Tmpl = document.createElement("template");
      Tmpl.innerHTML = Res.trim();
      El = Tmpl.content.firstElementChild;
      while (El !== null) {
        if (pas.SysUtils.SameText(El.tagName,"link") && $impl.IsResourceLink(El)) {
          aParent.append(document.importNode(El,true));
          ID = El.id;
          pas.System.Delete({get: function () {
              return ID;
            }, set: function (v) {
              ID = v;
            }},1,$impl.IDPrefix.length);
          if (ID !== "") Arr.push(ID);
        };
        El = El.nextElementSibling;
      };
      if (OnLoad != null) OnLoad(Arr);
      return Result;
    };
    function DoError(aValue) {
      var Result = undefined;
      Result = null;
      if (OnError != null) if (aValue === null) OnError("Error: " + aValue.message);
      return Result;
    };
    if (!$impl.HasTemplate()) {
      if (OnError != null) OnError("No template support in this browser");
    } else window.fetch(aURL).then(FetchOK).then(BlobOK).catch(DoError);
  };
  $mod.$implcode = function () {
    $impl.gMode = 0;
    $impl.GetRTLResourceInfo = function (aName, aInfo) {
      var Result = false;
      var RTLInfo = null;
      RTLInfo = rtl.getResource(pas.SysUtils.LowerCase(aName));
      Result = RTLInfo != null;
      if (Result) {
        aInfo.name = RTLInfo.name;
        aInfo.encoding = RTLInfo.encoding;
        aInfo.format = RTLInfo.format;
        aInfo.resourceunit = RTLInfo.unit;
        aInfo.data = RTLInfo.data;
      };
      return Result;
    };
    $impl.IDPrefix = "resource-";
    $impl.IsResourceLink = function (L) {
      var Result = false;
      Result = (pas.System.Copy(L.id,1,$impl.IDPrefix.length) === $impl.IDPrefix) && pas.JS.isDefined(L.dataset["unit"]) && (pas.System.Copy(L.href,1,4) === "data");
      return Result;
    };
    $impl.GetHTMLResourceInfo = function (aName, aInfo) {
      var Result = false;
      var el = null;
      var S = "";
      var I = 0;
      Result = false;
      if (!pas.JS.isDefined(document)) return Result;
      el = document.getElementById($impl.IDPrefix + pas.SysUtils.LowerCase(aName));
      Result = (el != null) && pas.SysUtils.SameText(el.tagName,"link");
      if (!Result) return Result;
      aInfo.name = pas.SysUtils.LowerCase(aName);
      aInfo.resourceunit = "" + el.dataset["unit"];
      S = el.href;
      S = pas.System.Copy(S,6,S.length - 5);
      I = pas.System.Pos(",",S);
      aInfo.data = pas.System.Copy(S,I + 1,S.length - 1);
      S = pas.System.Copy(S,1,I - 1);
      I = pas.System.Pos(";",S);
      if (I === 0) {
        aInfo.encoding = ""}
       else {
        aInfo.encoding = pas.System.Copy(S,I + 1,S.length - 1);
        S = pas.System.Copy(S,1,I - 1);
      };
      aInfo.format = S;
      return Result;
    };
    $impl.HasTemplate = function () {
      var Result = false;
      return ('content' in document.createElement('template'));
      return Result;
    };
  };
},["SysUtils","JS","Web"]);
rtl.module("assets",["System","Web","JS","p2jsres"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.ShipImage = null;
  this.BulletImage = null;
  this.EnemyImage = null;
  this.FireSound = null;
  this.ExplodeSound = null;
  this.RedImage = null;
  this.YellowImage = null;
  this.BlueImage = null;
  this.BlinkImage = null;
  this.C4NameImage = null;
  this.LoadResources = function (resfilename) {
    $impl.CreateAssetElements();
    pas.p2jsres.SetResourceSource(pas.p2jsres.TResourceSource.rsHTML);
    pas.p2jsres.LoadHTMLLinkResources(resfilename,$impl.OnLoaded,$impl.OnLoadFailed);
  };
  $mod.$implcode = function () {
    $impl.CreateAssetElements = function () {
      $mod.ShipImage = new Image();
      $mod.BulletImage = new Image();
      $mod.EnemyImage = new Image();
      $mod.RedImage = new Image();
      $mod.YellowImage = new Image();
      $mod.BlueImage = new Image();
      $mod.BlinkImage = new Image();
      $mod.C4NameImage = new Image();
      $mod.FireSound = document.createElement("audio");
      $mod.ExplodeSound = document.createElement("audio");
    };
    $impl.LoadImage = function (ImageName, Img) {
      var aInfo = pas.p2jsres.TResourceInfo.$new();
      if (!pas.p2jsres.GetResourceInfo(ImageName,aInfo)) {
        pas.System.Writeln("No info for image ",ImageName)}
       else Img.get().src = "data:" + aInfo.format + ";base64," + aInfo.data;
    };
    $impl.OnLoadFailed = function (aError) {
      window.alert("Failed to load resources : " + aError);
    };
    $impl.OnLoaded = function (LoadedResources) {
      $impl.LoadImage("red",{p: $mod, get: function () {
          return this.p.RedImage;
        }, set: function (v) {
          this.p.RedImage = v;
        }});
      $impl.LoadImage("yellow",{p: $mod, get: function () {
          return this.p.YellowImage;
        }, set: function (v) {
          this.p.YellowImage = v;
        }});
      $impl.LoadImage("blue",{p: $mod, get: function () {
          return this.p.BlueImage;
        }, set: function (v) {
          this.p.BlueImage = v;
        }});
      $impl.LoadImage("blink",{p: $mod, get: function () {
          return this.p.BlinkImage;
        }, set: function (v) {
          this.p.BlinkImage = v;
        }});
      $impl.LoadImage("c4name",{p: $mod, get: function () {
          return this.p.C4NameImage;
        }, set: function (v) {
          this.p.C4NameImage = v;
        }});
    };
  };
  $mod.$init = function () {
  };
},[]);
rtl.module("c4core",["System"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.EMPTY = 0;
  this.RED = 1;
  this.YELLOW = 2;
  this.LookAheadDepth = 5;
  this.weight$a$clone = function (a) {
    var b = [];
    b.length = 7;
    for (var c = 0; c < 7; c++) b[c] = a[c].slice(0);
    return b;
  };
  this.weight = [[3,1,0,11,20,26],[0,38,33,42,39,27],[35,60,74,81,77,48],[72,91,91,100,88,68],[37,48,88,95,81,78],[9,51,25,64,22,18],[3,7,6,28,26,27]];
  this.boardtype$clone = function (a) {
    var b = [];
    b.length = 7;
    for (var c = 0; c < 7; c++) b[c] = a[c].slice(0);
    return b;
  };
  rtl.recNewT(this,"TMove",function () {
    this.col = 0;
    this.row = 0;
    this.score = 0;
    this.$eq = function (b) {
      return (this.col === b.col) && (this.row === b.row) && (this.score === b.score);
    };
    this.$assign = function (s) {
      this.col = s.col;
      this.row = s.row;
      this.score = s.score;
      return this;
    };
  });
  this.init_board = function () {
    var c = 0;
    var r = 0;
    $impl.move_num = 0;
    for (r = 1; r <= 6; r++) for (c = 1; c <= 7; c++) $impl.board[c - 1][r - 1] = 0;
  };
  this.drop_piece = function (col, team) {
    var Result = 0;
    var row = 0;
    for (var $l = 6; $l >= 1; $l--) {
      row = $l;
      if ($impl.board[col - 1][row - 1] === 0) {
        $impl.board[col - 1][row - 1] = team;
        Result = row;
        $impl.move_num += 1;
        return Result;
      };
    };
    return Result;
  };
  this.do_computer_move = function (team) {
    var Result = 0;
    $impl.think(team,5);
    Result = $impl.move_result.col;
    return Result;
  };
  this.is_connect_four = function (col) {
    var Result = false;
    var team = 0;
    var row = 0;
    row = 1;
    while ($impl.board[col - 1][row - 1] === 0) row += 1;
    team = $impl.board[col - 1][row - 1];
    Result = $impl.is_connect_four_diag(col,row,team) || $impl.is_connect_four_vert(col,row,team) || $impl.is_connect_four_horiz(col,row,team);
    return Result;
  };
  this.get_drop_row = function (col) {
    var Result = 0;
    var i = 0;
    var row = 0;
    row = -1;
    for (i = 1; i <= 6; i++) {
      if ($impl.board[col - 1][i - 1] === 0) row = i;
    };
    Result = row;
    return Result;
  };
  this.get_game_piece = function (col, row) {
    var Result = 0;
    Result = $impl.board[col - 1][row - 1];
    return Result;
  };
  $mod.$implcode = function () {
    $impl.move_result = $mod.TMove.$new();
    $impl.move_num = 0;
    $impl.board = rtl.arraySetLength(null,0,7,6);
    $impl.undrop_piece = function (col) {
      var row = 0;
      row = 1;
      while ($impl.board[col - 1][row - 1] === 0) row = row + 1;
      $impl.board[col - 1][row - 1] = 0;
    };
    $impl.min = function (a, b) {
      var Result = 0;
      if (a < b) {
        Result = a}
       else Result = b;
      return Result;
    };
    $impl.max = function (a, b) {
      var Result = 0;
      if (a > b) {
        Result = a}
       else Result = b;
      return Result;
    };
    $impl.is_connect_four_vert = function (col, row, team) {
      var Result = false;
      var i = 0;
      if (row > 3) {
        Result = false}
       else {
        Result = true;
        for (var $l = row, $end = row + 3; $l <= $end; $l++) {
          i = $l;
          if ($impl.board[col - 1][i - 1] !== team) Result = false;
        };
      };
      return Result;
    };
    $impl.is_connect_four_horiz = function (col, row, team) {
      var Result = false;
      var i = 0;
      var run = 0;
      run = 0;
      Result = false;
      for (var $l = $impl.max(col - 4,1), $end = $impl.min(col + 4,7); $l <= $end; $l++) {
        i = $l;
        if ($impl.board[i - 1][row - 1] === team) {
          run = run + 1;
          if (run === 4) Result = true;
        } else run = 0;
      };
      return Result;
    };
    $impl.is_connect_four_ldiag = function (col, row, team) {
      var Result = false;
      var pos = 0;
      var start = 0;
      var finish = 0;
      var run = 0;
      start = -$impl.min($impl.min(col - 1,row - 1),3);
      finish = $impl.min($impl.min(7 - col,6 - row),3);
      run = 0;
      Result = false;
      for (var $l = start, $end = finish; $l <= $end; $l++) {
        pos = $l;
        if ($impl.board[(col + pos) - 1][(row + pos) - 1] === team) {
          run = run + 1;
          if (run === 4) Result = true;
        } else run = 0;
      };
      return Result;
    };
    $impl.is_connect_four_rdiag = function (col, row, team) {
      var Result = false;
      var pos = 0;
      var start = 0;
      var finish = 0;
      var run = 0;
      start = -$impl.min($impl.min(col - 1,6 - row),3);
      finish = $impl.min($impl.min(7 - col,row - 1),3);
      run = 0;
      Result = false;
      for (var $l = start, $end = finish; $l <= $end; $l++) {
        pos = $l;
        if ($impl.board[(col + pos) - 1][row - pos - 1] === team) {
          run = run + 1;
          if (run === 4) Result = true;
        } else run = 0;
      };
      return Result;
    };
    $impl.is_connect_four_diag = function (col, row, team) {
      var Result = false;
      Result = $impl.is_connect_four_ldiag(col,row,team) || $impl.is_connect_four_rdiag(col,row,team);
      return Result;
    };
    $impl.other_team = function (team) {
      var Result = 0;
      if (team === 1) {
        Result = 2}
       else Result = 1;
      return Result;
    };
    $impl.think = function (team, lookahead) {
      var best_move = $mod.TMove.$new();
      var this_move = $mod.TMove.$new();
      var movecol = 0;
      best_move.col = 4;
      best_move.score = -16384;
      for (movecol = 1; movecol <= 7; movecol++) {
        this_move.col = movecol;
        if ($impl.board[this_move.col - 1][0] === 0) {
          this_move.row = $mod.drop_piece(this_move.col,team);
          if ($mod.is_connect_four(this_move.col)) {
            $impl.undrop_piece(this_move.col);
            this_move.score = 16384;
            $impl.move_result.$assign(this_move);
            return;
          };
          this_move.score = 0;
          if (lookahead > 0) {
            $impl.think($impl.other_team(team),lookahead - 1);
            this_move.score = rtl.trunc((-$impl.move_result.score * 5) / 6);
          };
          this_move.score = this_move.score + $mod.weight[this_move.col - 1][this_move.row - 1];
          $impl.undrop_piece(this_move.col);
          if (this_move.score > best_move.score) {
            best_move.col = this_move.col;
            best_move.score = this_move.score;
          };
        };
      };
      $impl.move_result.$assign(best_move);
    };
  };
  $mod.$init = function () {
  };
},[]);
rtl.module("findrows",["System","c4core"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.HSize = 7;
  this.VSize = 6;
  this.GBItemEmpty = 0;
  rtl.recNewT(this,"GameBoardRec",function () {
    this.Item = 0;
    this.$eq = function (b) {
      return this.Item === b.Item;
    };
    this.$assign = function (s) {
      this.Item = s.Item;
      return this;
    };
  });
  this.GameBoard$clone = function (a) {
    var b = [];
    b.length = 7;
    for (var c = 0; c < 7; c++) {
      var d = b[c] = [];
      d.length = 6;
      var e = a[c];
      for (var f = 0; f < 6; f++) d[f] = $mod.GameBoardRec.$clone(e[f]);
    };
    return b;
  };
  rtl.recNewT(this,"itempoints",function () {
    this.x = 0;
    this.y = 0;
    this.stepx = 0;
    this.stepy = 0;
    this.item = 0;
    this.count = 0;
    this.$eq = function (b) {
      return (this.x === b.x) && (this.y === b.y) && (this.stepx === b.stepx) && (this.stepy === b.stepy) && (this.item === b.item) && (this.count === b.count);
    };
    this.$assign = function (s) {
      this.x = s.x;
      this.y = s.y;
      this.stepx = s.stepx;
      this.stepy = s.stepy;
      this.item = s.item;
      this.count = s.count;
      return this;
    };
  });
  this.aitempoints$clone = function (a) {
    var b = [];
    b.length = 1001;
    for (var c = 0; c < 1001; c++) b[c] = $mod.itempoints.$clone(a[c]);
    return b;
  };
  this.FindRowOfColors = function (apoints, LCount) {
    var Result = 0;
    var TGB = rtl.arraySetLength(null,$mod.GameBoardRec,7,6);
    var GB = rtl.arraySetLength(null,$mod.GameBoardRec,7,6);
    var i = 0;
    var j = 0;
    var count = 0;
    var rowcount = 0;
    $impl.InitAiQueue();
    rowcount = 0;
    $impl.CopyBoardToGB({get: function () {
        return GB;
      }, set: function (v) {
        GB = v;
      }});
    $impl.copygbtotgb({get: function () {
        return GB;
      }, set: function (v) {
        GB = v;
      }},{get: function () {
        return TGB;
      }, set: function (v) {
        TGB = v;
      }});
    for (j = 0; j <= 5; j++) {
      for (i = 0; i <= 3; i++) {
        count = $impl.FindColorCount({get: function () {
            return TGB;
          }, set: function (v) {
            TGB = v;
          }},i,j,1,0,LCount);
        if (count === LCount) {
          rowcount += 1;
          $impl.AddRowsToQueue({get: function () {
              return GB;
            }, set: function (v) {
              GB = v;
            }},i,j,1,0,count,apoints);
          $impl.DeleteRowFromBoard({get: function () {
              return TGB;
            }, set: function (v) {
              TGB = v;
            }},i,j,1,0,count);
        };
      };
    };
    $impl.copygbtotgb({get: function () {
        return GB;
      }, set: function (v) {
        GB = v;
      }},{get: function () {
        return TGB;
      }, set: function (v) {
        TGB = v;
      }});
    for (i = 0; i <= 6; i++) {
      for (j = 0; j <= 2; j++) {
        count = $impl.FindColorCount({get: function () {
            return TGB;
          }, set: function (v) {
            TGB = v;
          }},i,j,0,1,LCount);
        if (count === LCount) {
          rowcount += 1;
          $impl.AddRowsToQueue({get: function () {
              return GB;
            }, set: function (v) {
              GB = v;
            }},i,j,0,1,count,apoints);
          $impl.DeleteRowFromBoard({get: function () {
              return TGB;
            }, set: function (v) {
              TGB = v;
            }},i,j,0,1,count);
        };
      };
    };
    $impl.copygbtotgb({get: function () {
        return GB;
      }, set: function (v) {
        GB = v;
      }},{get: function () {
        return TGB;
      }, set: function (v) {
        TGB = v;
      }});
    for (j = 0; j <= 2; j++) {
      for (i = 0; i <= 3; i++) {
        count = $impl.FindColorCount({get: function () {
            return TGB;
          }, set: function (v) {
            TGB = v;
          }},i,j,1,1,LCount);
        if (count === LCount) {
          rowcount += 1;
          $impl.AddRowsToQueue({get: function () {
              return GB;
            }, set: function (v) {
              GB = v;
            }},i,j,1,1,count,apoints);
          $impl.DeleteRowFromBoard({get: function () {
              return TGB;
            }, set: function (v) {
              TGB = v;
            }},i,j,1,1,count);
        };
      };
    };
    $impl.copygbtotgb({get: function () {
        return GB;
      }, set: function (v) {
        GB = v;
      }},{get: function () {
        return TGB;
      }, set: function (v) {
        TGB = v;
      }});
    for (j = 0; j <= 2; j++) {
      for (i = 3; i <= 6; i++) {
        count = $impl.FindColorCount({get: function () {
            return TGB;
          }, set: function (v) {
            TGB = v;
          }},i,j,-1,1,LCount);
        if (count === LCount) {
          rowcount += 1;
          $impl.AddRowsToQueue({get: function () {
              return GB;
            }, set: function (v) {
              GB = v;
            }},i,j,-1,1,count,apoints);
          $impl.DeleteRowFromBoard({get: function () {
              return TGB;
            }, set: function (v) {
              TGB = v;
            }},i,j,-1,1,count);
        };
      };
    };
    Result = rowcount;
    return Result;
  };
  $mod.$implcode = function () {
    $impl.aiCounter = 0;
    $impl.CopyBoardToGB = function (GB) {
      var i = 0;
      var j = 0;
      for (j = 0; j <= 5; j++) {
        for (i = 0; i <= 6; i++) {
          GB.get()[i][j].Item = pas.c4core.get_game_piece(i + 1,j + 1);
        };
      };
    };
    $impl.InitAiQueue = function () {
      $impl.aiCounter = 0;
    };
    $impl.isPosInRange = function (x, y) {
      var Result = false;
      var maxx = 0;
      var maxy = 0;
      maxx = 7 - 1;
      maxy = 6 - 1;
      Result = (x >= 0) && (x <= maxx) && (y >= 0) && (y <= maxy);
      return Result;
    };
    $impl.isColorSame = function (TGB, x1, y1, x2, y2) {
      var Result = false;
      var c1 = 0;
      var c2 = 0;
      c1 = TGB.get()[x1][y1].Item;
      c2 = TGB.get()[x2][y2].Item;
      Result = (c1 > 0) && (c1 === c2);
      return Result;
    };
    $impl.FindColorCount = function (TGB, startx, starty, stepx, stepy, count) {
      var Result = 0;
      var i = 0;
      var c = 0;
      var xpos = 0;
      var ypos = 0;
      xpos = startx;
      ypos = starty;
      c = 1;
      for (var $l = 1, $end = count - 1; $l <= $end; $l++) {
        i = $l;
        if ($impl.isPosInRange(xpos,ypos) && $impl.isPosInRange(xpos + stepx,ypos + stepy)) {
          if ($impl.isColorSame(TGB,xpos,ypos,xpos + stepx,ypos + stepy)) {
            c += 1;
          } else {
            Result = c;
            return Result;
          };
        };
        xpos += stepx;
        ypos += stepy;
      };
      Result = c;
      return Result;
    };
    $impl.AddRowsToQueue = function (GB, x, y, stepx, stepy, count, apoints) {
      apoints.get()[$impl.aiCounter].item = GB.get()[x][y].Item;
      apoints.get()[$impl.aiCounter].x = x + 1;
      apoints.get()[$impl.aiCounter].y = y + 1;
      apoints.get()[$impl.aiCounter].stepx = stepx;
      apoints.get()[$impl.aiCounter].stepy = stepy;
      apoints.get()[$impl.aiCounter].count = count;
      $impl.aiCounter += 1;
    };
    $impl.DeleteRowFromBoard = function (TGB, x, y, stepx, stepy, count) {
      var i = 0;
      for (var $l = 1, $end = count; $l <= $end; $l++) {
        i = $l;
        TGB.get()[x][y].Item = 0;
        x += stepx;
        y += stepy;
      };
    };
    $impl.copygbtotgb = function (SGB, TGB) {
      var i = 0;
      var j = 0;
      for (j = 0; j <= 5; j++) {
        for (i = 0; i <= 6; i++) {
          TGB.get()[i][j].$assign(SGB.get()[i][j]);
        };
      };
    };
  };
  $mod.$init = function () {
  };
},[]);
rtl.module("board",["System","Web","assets","c4core","findrows"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TBoard",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.DropColumn = 0;
      this.PlayerTurn = 0;
      this.DropMode = false;
      this.DropPosY = 0;
      this.DropEndY = 0;
      this.DropSteps = 0;
      this.DropCount = 0;
      this.ComputerDropColumn = 0;
      this.timer = 0.0;
      this.GameOver = false;
      this.renderctx = null;
    };
    this.$final = function () {
      this.renderctx = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.create$1 = function () {
      this.Init();
      return this;
    };
    this.Init = function () {
      this.DropColumn = 4;
      this.ComputerDropColumn = 0;
      this.PlayerTurn = 1;
      this.DropMode = false;
      this.DropCount = 0;
      this.timer = 0;
      this.GameOver = false;
      pas.c4core.init_board();
    };
    this.NewGame = function () {
      this.Init();
    };
    this.DrawBoard = function () {
      var c = 0;
      var r = 0;
      for (r = 1; r <= 6; r++) {
        for (c = 1; c <= 7; c++) {
          var $tmp = pas.c4core.get_game_piece(c,r);
          if ($tmp === 1) {
            this.renderctx.drawImage(pas.assets.RedImage,c * 29,r * 27,32,32)}
           else if ($tmp === 2) this.renderctx.drawImage(pas.assets.YellowImage,c * 29,r * 27,32,32);
          this.renderctx.drawImage(pas.assets.BlueImage,c * 29,r * 27,32,32);
        };
      };
      this.renderctx.drawImage(pas.assets.C4NameImage,(8 * 29) + 4,(1 * 27) + 20);
    };
    this.DrawPosition = function () {
      if (this.PlayerTurn === 1) {
        this.renderctx.drawImage(pas.assets.RedImage,this.DropColumn * 29,0,32,32);
      } else {
        this.renderctx.drawImage(pas.assets.YellowImage,this.DropColumn * 29,0,32,32);
      };
    };
    this.DrawFalling = function () {
      if (this.PlayerTurn === 1) {
        this.renderctx.drawImage(pas.assets.RedImage,this.DropColumn * 29,this.DropPosY,32,32);
      } else {
        this.renderctx.drawImage(pas.assets.YellowImage,this.DropColumn * 29,this.DropPosY,32,32);
      };
    };
    this.MovedropPiece = function (dir) {
      if (this.DropMode) return;
      this.DropColumn += dir;
      if (this.DropColumn < 1) this.DropColumn = 1;
      if (this.DropColumn > 7) this.DropColumn = 7;
    };
    this.setRenderCTX = function (ctx) {
      this.renderctx = ctx.get();
    };
    this.Draw = function () {
      if (this.DropMode) {
        this.DrawFalling()}
       else this.DrawPosition();
      this.DrawBoard();
    };
    this.Update = function (aTime) {
      if (aTime > (this.timer + 10)) {
        this.timer = aTime;
        this.MovePiece();
      };
    };
    this.DropPiece = function () {
      if (this.GameOver) return;
      if (this.DropMode) return;
      this.DropMode = true;
      this.DropPosY = 0;
      this.DropEndY = pas.c4core.get_drop_row(this.DropColumn) * 27;
      this.DropSteps = 1;
      this.DropCount = 0;
    };
    this.MovePiece = function () {
      if (this.DropMode) {
        this.DropPosY += this.DropSteps;
        if (this.DropPosY >= this.DropEndY) {
          if (this.PlayerTurn === 1) {
            pas.c4core.drop_piece(this.DropColumn,1);
            this.DropCount += 1;
            this.DropPosY = 0;
            if (pas.c4core.is_connect_four(this.DropColumn) === false) {
              this.PlayerTurn = 2;
              this.DropColumn = pas.c4core.do_computer_move(2);
              this.DropEndY = pas.c4core.get_drop_row(this.DropColumn) * 27;
            } else {
              this.GameOver = true;
              this.DropMode = false;
            };
          } else if (this.PlayerTurn === 2) {
            pas.c4core.drop_piece(this.DropColumn,2);
            this.DropCount += 1;
            this.DropPosY = 0;
            if (pas.c4core.is_connect_four(this.DropColumn) === false) {
              this.PlayerTurn = 1;
            } else {
              this.GameOver = true;
              this.DropMode = false;
            };
          };
          if (this.DropCount === 2) {
            this.DropMode = false;
            this.DropCount = 0;
          };
        };
      };
    };
    this.isGameOver = function () {
      var Result = false;
      Result = this.GameOver;
      return Result;
    };
  });
  $mod.$init = function () {
  };
});
rtl.module("rowblink",["System","Web","assets","c4core","findrows"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TRowBlink",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.timer = 0.0;
      this.renderctx = null;
      this.rowcount = 0;
      this.blinkCount = 0;
      this.apoints = rtl.arraySetLength(null,pas.findrows.itempoints,1001);
      this.Loaded = false;
    };
    this.$final = function () {
      this.renderctx = undefined;
      this.apoints = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.create$1 = function () {
      this.timer = 0;
      this.rowcount = 0;
      this.blinkCount = 0;
      this.Loaded = false;
      return this;
    };
    this.setRenderCTX = function (ctx) {
      this.renderctx = ctx.get();
    };
    this.BuildRowList = function () {
      this.rowcount = pas.findrows.FindRowOfColors({p: this, get: function () {
          return this.p.apoints;
        }, set: function (v) {
          this.p.apoints = v;
        }},4);
      this.Loaded = true;
    };
    this.ClearRowList = function () {
      this.Loaded = false;
    };
    this.Draw = function () {
      var i = 0;
      var c = 0;
      var nx = 0;
      var ny = 0;
      if (this.blinkCount === 2) return;
      for (var $l = 0, $end = this.rowcount - 1; $l <= $end; $l++) {
        i = $l;
        var $with = this.apoints[i];
        nx = $with.x;
        ny = $with.y;
        for (var $l1 = 1, $end1 = $with.count; $l1 <= $end1; $l1++) {
          c = $l1;
          this.renderctx.drawImage(pas.assets.BlinkImage,nx * 29,ny * 27,32,32);
          nx += $with.stepx;
          ny += $with.stepy;
        };
      };
    };
    this.Update = function (aTime) {
      if (this.Loaded === false) this.BuildRowList();
      if (aTime > (this.timer + 200)) {
        this.timer = aTime;
        this.blinkCount += 1;
        if (this.blinkCount > 2) this.blinkCount = 1;
      };
    };
  });
  $mod.$init = function () {
  };
});
rtl.module("program",["System","JS","Web","assets","board","rowblink"],function () {
  "use strict";
  var $mod = this;
  this.canvas = null;
  this.ctx = null;
  this.canvas2 = null;
  this.ctx2 = null;
  this.divElement = null;
  this.myBoard = null;
  this.myRowBlink = null;
  this.InitCanvasPixelProperties = function () {
    $mod.ctx = $mod.canvas.getContext("2d");
    $mod.ctx.imageSmoothingEnabled = false;
    $mod.canvas.style["image-rendering"] = "pixelated";
    $mod.ctx2 = $mod.canvas2.getContext("2d");
    $mod.ctx2.imageSmoothingEnabled = false;
    $mod.canvas2.style["image-rendering"] = "pixelated";
  };
  this.InitCanvas = function () {
    $mod.canvas = document.createElement("canvas");
    $mod.canvas.width = window.innerWidth - 20;
    $mod.canvas.height = window.innerHeight - 20;
    $mod.canvas.id = "canvas";
    $mod.canvas2 = document.createElement("canvas");
    $mod.canvas2.width = 320;
    $mod.canvas2.height = 200;
    $mod.canvas2.id = "canvas2";
    $mod.InitCanvasPixelProperties();
    $mod.divElement = document.getElementById("gameboard");
    $mod.divElement.appendChild($mod.canvas);
    $mod.myBoard = pas.board.TBoard.$create("create$1");
    $mod.myBoard.setRenderCTX({p: $mod, get: function () {
        return this.p.ctx2;
      }, set: function (v) {
        this.p.ctx2 = v;
      }});
    $mod.myRowBlink = pas.rowblink.TRowBlink.$create("create$1");
    $mod.myRowBlink.setRenderCTX({p: $mod, get: function () {
        return this.p.ctx2;
      }, set: function (v) {
        this.p.ctx2 = v;
      }});
  };
  this.Update = function (aTime) {
    $mod.myBoard.Update(aTime);
    if ($mod.myBoard.isGameOver()) $mod.myRowBlink.Update(aTime);
  };
  this.Draw = function () {
    $mod.canvas2.style["backgroundColor"] = "black";
    $mod.ctx2.clearRect(0,0,$mod.canvas2.width,$mod.canvas2.height);
    $mod.myBoard.Draw();
    if ($mod.myBoard.isGameOver()) $mod.myRowBlink.Draw();
    $mod.canvas.style["backgroundColor"] = "black";
    $mod.ctx.clearRect(0,0,$mod.canvas.width,$mod.canvas.height);
    $mod.ctx.drawImage($mod.canvas2,0,0,$mod.canvas.width,$mod.canvas.height);
  };
  this.main_loop = function (aTime) {
    $mod.Update(aTime);
    $mod.Draw();
    window.requestAnimationFrame($mod.main_loop);
  };
  this.start_main_loop = function () {
    window.requestAnimationFrame($mod.main_loop);
  };
  this.onLoad = function (aEvent) {
    var Result = false;
    pas.assets.LoadResources("game-res.html");
    $mod.InitCanvas();
    $mod.start_main_loop();
    return Result;
  };
  this.onResize = function (aEvent) {
    var Result = false;
    $mod.canvas.width = window.innerWidth - 20;
    $mod.canvas.height = window.innerHeight - 20;
    $mod.InitCanvasPixelProperties();
    $mod.Draw();
    return Result;
  };
  this.NewGame = function () {
    $mod.myRowBlink.ClearRowList();
    $mod.myBoard.NewGame();
  };
  this.HandleKeyDown = function (k) {
    var Result = false;
    if (k.key === pas.Web.TJSKeyNames.ArrowRight) $mod.myBoard.MovedropPiece(1);
    if (k.key === pas.Web.TJSKeyNames.ArrowLeft) $mod.myBoard.MovedropPiece(-1);
    if (k.key === pas.Web.TJSKeyNames.ArrowDown) $mod.myBoard.DropPiece();
    if (k.code === "KeyN") $mod.NewGame();
    if ((k.code === "KeyQ") || (k.code === "KeyX")) {
      window.open("https:\/\/github.com\/RetroNick2020","_self");
    };
    if (k.key === "F11") $mod.canvas.requestFullScreen();
    return Result;
  };
  $mod.$main = function () {
    window.onkeydown = rtl.createSafeCallback($mod,"HandleKeyDown");
    window.onresize = rtl.createSafeCallback($mod,"onResize");
    window.onload = rtl.createSafeCallback($mod,"onLoad");
  };
});
