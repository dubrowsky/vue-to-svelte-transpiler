<template>
  <div>
    <button @click="increase" :class="$style.button">
      Add
    </button>
    Hi, {{ message }}
  </div>
</template>

<script>
export default {
  props: ['name', 'separator'],
  data() {
    return {
      count: 1
    }
  },
  methods: {
    increase() {
      this.count++;
    }
  },
  computed: {
    message() {
      const { count, separator, name } = this;
      return Array(count).fill(name).join(separator)
    }
  }
};
</script>

<style module>
.button {
  color: red;
}
</style>
