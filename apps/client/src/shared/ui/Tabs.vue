<script setup lang="ts">
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
defineProps<{ label: string; tabs: readonly { value: string; label: string }[] }>();
const selected = defineModel<string>({ required: true });
</script>

<template>
  <TabsRoot v-model="selected">
    <TabsList :aria-label="label">
      <TabsTrigger v-for="tab in tabs" :key="tab.value" :value="tab.value">{{ tab.label }}</TabsTrigger>
    </TabsList>
    <TabsContent v-for="tab in tabs" :key="tab.value" :value="tab.value"><slot :name="tab.value" /></TabsContent>
  </TabsRoot>
</template>
