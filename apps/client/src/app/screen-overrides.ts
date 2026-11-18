import type { Component, InjectionKey } from 'vue';

export const GAME_SCREEN_OVERRIDE_KEY: InjectionKey<Component> = Symbol('game-screen-override');
export const GAME_OVER_SCREEN_OVERRIDE_KEY: InjectionKey<Component> = Symbol('game-over-screen-override');
