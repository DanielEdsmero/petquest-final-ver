/*
 * Phase 3 — navigation structure.
 *
 * The route tree, the safe-area contract and the list-container choice are all
 * things that break silently and are tedious to catch by hand on a device, so
 * they are asserted against the files themselves. Behaviour that needs a
 * renderer (gestures, actual pixel insets) stays in the Phase 8 device suite.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRedirect, Routes } from '../src/auth/guards.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'src', 'app');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const app = (p: string) => read(path.join('src', 'app', p));

/** Every route file under src/app, as posix-style paths relative to it. */
function routeFiles(dir = APP, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...routeFiles(path.join(dir, entry.name), rel));
    else if (/\.tsx$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const ROUTES = routeFiles();
const TAB_SCREENS = ['(tabs)/index.tsx', '(tabs)/quests.tsx', '(tabs)/pet.tsx', '(tabs)/profile.tsx'];
/** Screens rendered inside a stack that shows a native header. */
const HEADERED_SCREENS = [
  'quest/create.tsx',
  'quest/[id].tsx',
  'quest/verify.tsx',
  'admin/index.tsx',
  'admin/validity.tsx',
  'admin/verification.tsx',
];

describe('1. the route tree matches the planned structure', () => {
  test('every required route file exists', () => {
    const required = [
      '_layout.tsx',
      '(auth)/login.tsx',
      '(tabs)/_layout.tsx',
      ...TAB_SCREENS,
      'quest/create.tsx',
      'quest/[id].tsx',
      'quest/verify.tsx',
      'admin/_layout.tsx',
      'admin/index.tsx',
      'admin/validity.tsx',
      'admin/verification.tsx',
    ];
    for (const r of required) {
      assert.ok(existsSync(path.join(APP, r)), `missing route: ${r}`);
    }
  });

  test('the old flat home screen was moved into the tab group, not duplicated', () => {
    // Two files claiming "/" would be an ambiguous route.
    assert.ok(!existsSync(path.join(APP, 'index.tsx')), 'src/app/index.tsx should not exist');
    assert.ok(existsSync(path.join(APP, '(tabs)', 'index.tsx')));
  });

  test('every route file has a default export', () => {
    for (const r of ROUTES) {
      assert.match(app(r), /export default function/, `${r} has no default export`);
    }
  });
});

describe('2. tabs', () => {
  test('the four tabs are declared, in order', () => {
    const layout = app('(tabs)/_layout.tsx');
    const names = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ['index', 'quests', 'pet', 'profile']);
  });

  test('every tab has a title, an icon and an accessibility label', () => {
    const layout = app('(tabs)/_layout.tsx');
    assert.equal((layout.match(/title:/g) || []).length, 4);
    assert.equal((layout.match(/tabBarIcon:/g) || []).length, 4);
    assert.equal((layout.match(/tabBarAccessibilityLabel:/g) || []).length, 4);
  });

  test('admin is not a tab', () => {
    const layout = app('(tabs)/_layout.tsx');
    assert.doesNotMatch(layout, /name="admin"/);
    // …and it lives in its own group with its own gate.
    assert.ok(existsSync(path.join(APP, 'admin', '_layout.tsx')));
  });
});

describe('3. safe areas — content never sits under the home indicator or a header', () => {
  test('tab screens do not double-pad the bottom inset', () => {
    // The tab bar already clears the home indicator and the scene is laid out
    // above the bar; adding insets.bottom again would push content up twice.
    for (const s of TAB_SCREENS) {
      assert.match(app(s), /insetBottom=\{false\}/, `${s} should pass insetBottom={false}`);
    }
  });

  test('screens under a native header do not double-pad the top inset', () => {
    for (const s of HEADERED_SCREENS) {
      assert.match(app(s), /insetTop=\{false\}/, `${s} should pass insetTop={false}`);
    }
  });

  test('the login screen, which has no header, keeps its top inset', () => {
    assert.doesNotMatch(app('(auth)/login.tsx'), /insetTop=\{false\}/);
  });

  test('ScreenContainer applies both insets by default and can drop either', () => {
    const src = read('src/components/ScreenContainer.tsx');
    assert.match(src, /insetTop = true/);
    assert.match(src, /insetBottom = true/);
    assert.match(src, /paddingTop: \(insetTop \? insets\.top : 0\)/);
    assert.match(src, /paddingBottom: \(insetBottom \? insets\.bottom : 0\)/);
    // Side insets matter on curved-edge devices and in landscape.
    assert.match(src, /paddingLeft: Math\.max\(insets\.left/);
    assert.match(src, /paddingRight: Math\.max\(insets\.right/);
  });

  test('every screen renders inside ScreenContainer', () => {
    const screens = ROUTES.filter((r) => !r.endsWith('_layout.tsx'));
    for (const s of screens) {
      assert.match(app(s), /<ScreenContainer/, `${s} does not use ScreenContainer`);
    }
  });
});

describe('4. forms stay usable when the keyboard opens', () => {
  test('the container avoids the keyboard and keeps taps working', () => {
    const src = read('src/components/ScreenContainer.tsx');
    assert.match(src, /KeyboardAvoidingView/);
    assert.match(src, /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
    // Without this, the first tap on a button only dismisses the keyboard.
    assert.match(src, /keyboardShouldPersistTaps="handled"/);
  });

  test('the login inputs declare the right keyboard and autofill hints', () => {
    const src = app('(auth)/login.tsx');
    assert.match(src, /keyboardType="email-address"/);
    assert.match(src, /autoCapitalize="none"/);
    assert.match(src, /secureTextEntry/);
    assert.match(src, /onSubmitEditing=\{onSubmit\}/);
  });
});

describe('5. long lists are virtualised, not mapped into a ScrollView', () => {
  const listScreens = ['(tabs)/quests.tsx', 'admin/validity.tsx', 'admin/verification.tsx'];

  test('list screens use FlatList', () => {
    for (const s of listScreens) assert.match(app(s), /<FlatList/, `${s} should use FlatList`);
  });

  test('list screens opt out of the container ScrollView', () => {
    // A FlatList inside a ScrollView loses virtualisation and warns at runtime.
    for (const s of listScreens) {
      assert.match(app(s), /scroll=\{false\}/, `${s} must pass scroll={false}`);
    }
  });

  test('the quest list has a key extractor, an empty state and pull-to-refresh', () => {
    const src = app('(tabs)/quests.tsx');
    assert.match(src, /keyExtractor=/);
    assert.match(src, /ListEmptyComponent=/);
    assert.match(src, /RefreshControl/);
  });
});

describe('6. no dead ends', () => {
  test('every pushed route is reachable from a tab', () => {
    const reachable = TAB_SCREENS.map((s) => app(s)).join('\n');
    for (const target of ['/quest/create', '/quests', '/admin']) {
      assert.ok(reachable.includes(target), `nothing navigates to ${target}`);
    }
  });

  test('quest detail is reachable from the quest list', () => {
    assert.match(app('(tabs)/quests.tsx'), /pathname: '\/quest\/\[id\]'/);
  });

  test('the evidence screen is not linked yet, and says so rather than pretending', () => {
    // Phase 4C is read-only: submit_completion needs a photo path, so
    // completing a quest is inseparable from evidence capture (4D), which in
    // turn needs the /api/verify auth fix in Phase 5. The button explains that
    // instead of navigating to a screen that cannot finish the job.
    //
    // WHEN 4D LANDS: re-link detail → /quest/verify and restore the assertion
    // that this test replaced.
    const detail = app('quest/[id].tsx');
    assert.doesNotMatch(detail, /pathname: '\/quest\/verify'/);
    assert.match(detail, /Not available yet/);
    assert.ok(existsSync(path.join(APP, 'quest', 'verify.tsx')), 'the route should still exist');
  });

  test('both admin queues are reachable from the admin landing', () => {
    const src = app('admin/index.tsx');
    assert.match(src, /\/admin\/validity/);
    assert.match(src, /\/admin\/verification/);
  });

  test('pushed stacks show a native header, so back and the swipe gesture work', () => {
    for (const layout of ['quest/_layout.tsx', 'admin/_layout.tsx']) {
      assert.match(app(layout), /headerShown: true/, `${layout} needs a header for back nav`);
    }
  });

  test('a non-admin who reaches the admin group is redirected, not stranded', () => {
    assert.match(app('admin/_layout.tsx'), /if \(!isAdmin\) return <Redirect href="\/" \/>/);
  });
});

describe('7. guards still hold for the grouped routes', () => {
  test('signed-in users move freely around the tabs', () => {
    for (const seg of [['(tabs)'], ['(tabs)', 'quests'], ['(tabs)', 'pet'], ['(tabs)', 'profile']]) {
      assert.equal(resolveRedirect({ status: 'signedIn', isAdmin: false, segments: seg }), null);
    }
  });

  test('signed-out users are pushed to login from any tab', () => {
    for (const seg of [['(tabs)'], ['(tabs)', 'quests'], ['quest', 'create']]) {
      assert.equal(
        resolveRedirect({ status: 'signedOut', isAdmin: false, segments: seg }),
        Routes.login,
      );
    }
  });

  test('a non-admin is bounced off every admin route', () => {
    for (const seg of [['admin'], ['admin', 'validity'], ['admin', 'verification']]) {
      assert.equal(
        resolveRedirect({ status: 'signedIn', isAdmin: false, segments: seg }),
        Routes.home,
      );
    }
  });

  test('an admin is left alone on every admin route', () => {
    for (const seg of [['admin'], ['admin', 'validity'], ['admin', 'verification']]) {
      assert.equal(resolveRedirect({ status: 'signedIn', isAdmin: true, segments: seg }), null);
    }
  });
});

describe('8. small-screen readability', () => {
  test('nothing declares a fixed width wider than a 320pt phone', () => {
    // A hardcoded width above ~288 (320 minus the 16pt gutters) would force a
    // horizontal scroll on an iPhone SE.
    const offenders: string[] = [];
    for (const r of ROUTES) {
      for (const m of app(r).matchAll(/\bwidth:\s*(\d+)\b/g)) {
        if (Number(m[1]) > 288) offenders.push(`${r}: width ${m[1]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('no screen sets a minWidth', () => {
    for (const r of ROUTES) {
      assert.doesNotMatch(app(r), /\bminWidth:/, `${r} sets a minWidth`);
    }
  });

  test('the content column is capped rather than stretched', () => {
    const theme = read('src/theme.ts');
    assert.match(theme, /MaxContentWidth = (\d+)/);
    const cap = Number(/MaxContentWidth = (\d+)/.exec(theme)![1]);
    assert.ok(cap >= 320 && cap <= 600, `MaxContentWidth ${cap} is outside a sensible range`);
    assert.match(read('src/components/ScreenContainer.tsx'), /maxWidth: MaxContentWidth/);
  });

  test('tap targets are at least 40pt', () => {
    const offenders: string[] = [];
    for (const r of ROUTES) {
      for (const m of app(r).matchAll(/\bminHeight:\s*(\d+)\b/g)) {
        if (Number(m[1]) < 40) offenders.push(`${r}: minHeight ${m[1]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
