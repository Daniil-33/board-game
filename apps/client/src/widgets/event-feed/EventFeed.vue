<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { describeEvent, type JournalItem } from '../../entities/event/index';
import { formatTime } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';

const props = defineProps<{
  items: readonly JournalItem[];
  generation: number;
  visible: boolean;
  nameOf: (id: string) => string;
  assetOf: (id: string) => string;
}>();
const list = ref<HTMLElement | null>(null);
const atBottom = ref(true);
const rows = computed(() => props.items.flatMap<{ key: string; at: number; icon: string; author: string | null; text: string; kind: JournalItem['kind'] }>(item => {
  if (item.kind === 'chat') {
    return [{ key: item.key, at: item.at, icon: '◌', author: props.nameOf(item.message.authorId), text: item.message.text, kind: 'chat' }];
  }
  const content = describeEvent(item.event, props.nameOf, props.assetOf);
  return content ? [{ ...content, key: item.key, at: item.at, author: null, kind: 'event' }] : [];
}));

function updateScroll(): void {
  const el = list.value;
  if (el && props.visible) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 2;
}

function scrollToBottom(): void {
  if (list.value && props.visible && atBottom.value) list.value.scrollTop = list.value.scrollHeight;
}

onMounted(scrollToBottom);
watch(() => [rows.value.length, props.generation, props.visible], async () => {
  await nextTick();
  scrollToBottom();
});
</script>

<template>
  <section class="event-feed game-surface" data-testid="event-feed">
    <h2>{{ t('game_layout.journal') }}</h2>
    <ol ref="list" class="journal-list" tabindex="0" :aria-label="t('game_layout.journal')"
      data-testid="journal-list" @scroll="updateScroll">
      <li v-for="row in rows" :key="row.key" data-testid="journal-entry" :data-kind="row.kind">
        <span class="journal-icon" aria-hidden="true">{{ row.icon }}</span>
        <div>
          <strong v-if="row.author">{{ row.author }}</strong>
          <p>{{ row.text }}</p>
        </div>
        <time >{{ formatTime(row.at) }}</time>
      </li>
    </ol>
    <slot />
  </section>
</template>

<style scoped>
.journal-list { overflow-anchor: none; max-height: 280px; min-height: 100px; overflow: auto; overflow-wrap: anywhere; }
.journal-list li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0 var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--border-strong); }
.journal-list p { margin: 0; white-space: pre-wrap; }
.journal-list time { grid-column: 2; color: var(--text-muted); font-size: .75rem; }
.journal-icon { color: var(--accent-mint); }
@media (max-width: 1023px) { .journal-list { overflow-anchor: none; max-height: 55vh; } }
</style>
