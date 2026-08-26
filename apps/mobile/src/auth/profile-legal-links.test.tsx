import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileRouteView } from '../../app/profile';
import appJson from '../../app.json';

// react-native is replaced by host component strings across this suite; the real package is
// Flow-typed and the transform cannot parse it. Anything the screen imports has to appear here,
// which is why Linking does.
const openURL = vi.fn((_url: string) => Promise.resolve(true));
vi.mock('react-native', () => ({
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
  Linking: { openURL: (url: string) => openURL(url) },
}));
vi.mock('expo-router', () => ({ Link: 'Link' }));
vi.mock('../runtime/mobile-runtime', () => ({ useMobileRuntime: vi.fn(), useMobileSession: vi.fn() }));

afterEach(() => openURL.mockClear());

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(props: Partial<React.ComponentProps<typeof ProfileRouteView>> = {}) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<ProfileRouteView
      session={{ status: 'signed-out' }} email="" password="" busy={false}
      mode="SIGN_IN" onMode={vi.fn()} onEmail={vi.fn()} onPassword={vi.fn()}
      onSignIn={vi.fn()} onSignUp={vi.fn()} onSignOut={vi.fn()} onOAuth={vi.fn()}
      appVersion="9.9.9"
      {...props}
    />);
  });
  return tree;
}

/**
 * The footer used to print "개인정보처리방침" as plain text. Play requires the policy to be
 * reachable, and a person deciding whether to sign up has no other route to it from inside the
 * app. These fix the two halves: that it opens the configured portal, and that an unconfigured
 * build does not render a link that goes nowhere.
 */
describe('profile legal links', () => {
  it('opens the published privacy policy and terms', () => {
    const tree = render({ portalOrigin: 'https://touchcatch.example' });

    const privacy = tree.root.findByProps({ accessibilityLabel: '개인정보처리방침 열기' });
    const terms = tree.root.findByProps({ accessibilityLabel: '서비스 이용약관 열기' });
    act(() => { privacy.props.onPress(); terms.props.onPress(); });

    // Trailing slashes match the portal's `trailingSlash: true`; without them Vercel redirects
    // and an in-app browser shows the hop.
    expect(openURL.mock.calls).toEqual([
      ['https://touchcatch.example/privacy/'],
      ['https://touchcatch.example/terms/'],
    ]);
  });

  it('renders the words unlinked when no portal is configured', () => {
    const tree = render({ portalOrigin: null });
    expect(tree.root.findAllByProps({ accessibilityLabel: '개인정보처리방침 열기' })).toHaveLength(0);
    // The text stays: a development build should still say what the app has, just not pretend
    // there is somewhere to go.
    expect(JSON.stringify(tree.toJSON())).toContain('개인정보처리방침');
  });

  it('shows the version from app.json rather than a retyped literal', () => {
    const tree = render({ appVersion: appJson.expo.version });
    // JSX splits `TouchCatch v{version} (Closed Beta)` into three children, so the assertion has
    // to join them; searching the serialised tree for the whole sentence never matches.
    const captions = tree.root
      .findAllByType('Text' as unknown as Parameters<typeof tree.root.findAllByType>[0])
      .map((node) => (Array.isArray(node.children) ? node.children : []).filter((c) => typeof c === 'string').join(''));
    expect(captions).toContain(`TouchCatch v${appJson.expo.version} (Closed Beta)`);
  });
});
