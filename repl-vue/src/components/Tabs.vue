<template>
  <div class="tabs">
    <div
        v-for="(tab, i) in tabs"
        :class="`tab ${active === i ? '_active' : ''}`"
        @click="selectTab(i)"
    >
      <template v-if="isEditing && active === i">
        <input
          v-model="editedValue"
          @keypress="e => e.key === 'Enter' && updateTab()"
          @blur="updateTab"
        />
        <span
          v-if="canDelete"
          class="delete"
          @click.stop="deleteTab"
        >&times;</span>
      </template>
      <template v-else>{{ tab }}</template>
    </div>
    <div v-if="add" class="add" @click="addTab">+</div>
  </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

export default Vue.extend({
  props: {
    tabs: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    active: Number,
    edit: Boolean,
    add: Boolean
  },
  data() {
    return {
      isEditing: false,
      editedValue: '',
      updateTimeout: undefined as number | undefined,
    };
  },
  computed: {
    isEditedValueValid(): boolean {
      const { editedValue, tabs } = this;
      return editedValue !== '' && !tabs.find(tab => tab === editedValue);
    },
    canDelete(): boolean {
      return this.tabs.length > 1;
    },
  },
  methods: {
    selectTab(index: number) {
      if (index === this.active && this.edit) {
        this.startEditTab();
      } else {
        this.$emit('selectTab', index);
      }
    },
    startEditTab() {
      if (this.active === undefined || this.isEditing) {
        return;
      }
      this.isEditing = true;
      this.editedValue = this.tabs[this.active];
      this.$nextTick(
        () => {
          const inp = this.$el.querySelector('input');
          if (inp) {
            inp.focus();
          }
        }
      )
    },
    updateTab() {
      this.updateTimeout = setTimeout(() => {
        if (this.isEditing && this.isEditedValueValid) {
          this.$emit('updateTabName', this.editedValue);
        }
        this.isEditing = false;
        this.editedValue = '';
      }, 150);
    },
    deleteTab() {
      clearTimeout(this.updateTimeout);
      this.isEditing = false;
      this.$emit('deleteTab');
    },
    addTab() {
      this.$emit('addTab');
      this.$nextTick(
        () => {
          this.selectTab(this.tabs.length - 1);
          this.$nextTick(() => {
            this.startEditTab();
          });
        }
      );
    }
  }
});
</script>

<style scoped>
.tabs {
  display: flex;
  overflow: auto;
}
.tab, .add {
  padding: 6px 8px;
  cursor: pointer;
  color: #d4d4d4;
}

.add {
  position: sticky;
  right: 0;
  background: #001a34;
  padding-left: 12px;
  padding-right: 12px;
}

input {
  background: transparent;
  border: none;
  color: #d4d4d4;
  font-size: 16px;
  padding: 0;
  outline: none;
  width: 120px;
}

.tab {
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}
.tab._active {
  border-bottom: 2px solid #30E900;
  color: #30E900;
}
</style>
