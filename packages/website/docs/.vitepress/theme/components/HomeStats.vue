<!-- Licensed under the Apache License Version 2.0 that can be found in the
 LICENSE file in the root directory of this source tree.

 Landing stats strip: library surface at a glance. -->
<template>
  <div class="stats">
    <div class="stat"><b>11</b><span>shape components</span></div>
    <div class="stat"><b>4</b><span>gradient types</span></div>
    <div class="stat"><b>28</b><span>blend modes</span></div>
    <div class="stat"><b>16</b><span>animatable properties</span></div>
    <div class="stat"><b>0</b><span>JS per animated frame</span></div>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 18px;
  margin: 8px 0 24px;
  padding: 30px 0;
  border-top: 1px solid #2a3765;
  border-bottom: 1px solid #2a3765;
}
.stat b {
  display: block;
  font-size: 26px;
  font-family:
    ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  color: #2dd4bf;
}
.stat span {
  font-size: 13px;
  color: #7683b3;
}
</style>
