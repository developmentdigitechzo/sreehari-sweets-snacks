import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { Reveal } from '../animations/Reveal';
import { AppText } from '../components/AppText';
import { DemoTag, Field } from '../components/Atoms';
import { BottomSheet } from '../components/BottomSheet';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PermissionRow, PhotosRow } from '../components/PermissionRows';
import { ProductImage } from '../components/ProductImage';
import { StatusChip } from '../components/StatusChip';
import { DEMO_CONFIG } from '../data/config';
import { API_URL } from '../config/api';
import { useRewardsBalance } from '../hooks/useShopData';
import { API_MODE, api } from '../services/api';
import { evaluateCoupon } from '../services/pricing';
import { authApi } from '../services/authApi';
import { useAuth } from '../store/useAuth';
import { useCatalog } from '../store/useCatalog';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, fonts, layout, radius, shadow, spacing } from '../theme';
import { rupee } from '../utils/format';
import { pickImage } from '../utils/pickImage';

function AvatarFace({ uri, demo, name, size }: { uri?: string; demo?: boolean; name: string; size: number }) {
  if (uri) return <ProductImage image={{ id: 'me', uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  if (demo) return <ProductImage image="avatar-user" style={{ width: size, height: size, borderRadius: size / 2 }} />;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Avatar ${initials}`}>
      <AppText style={{ fontFamily: fonts.bold, fontSize: size * 0.36, color: colors.accent }}>{initials}</AppText>
    </View>
  );
}

type Panel = null | 'edit' | 'payments' | 'notifications' | 'privacy' | 'help' | 'about';

export function AccountScreen() {
  const nav = useNavigation();
  const user = useAuth((s) => s.user);
  const logoutAuth = useAuth((s) => s.logout);
  const profile = useShop((s) => s.profile);
  const updateProfile = useShop((s) => s.updateProfile);
  const orders = useShop((s) => s.orders);
  const wishlist = useShop((s) => s.wishlist);
  const addresses = useShop((s) => s.addresses);
  const notif = useShop((s) => s.notifications);
  const catVersion = useCatalog((s) => s.version);
  const setNotif = useShop((s) => s.setNotification);
  const resetDemo = useShop((s) => s.resetDemo);
  const coupons = useCatalog((s) => s.coupons);
  const { points, rupees } = useRewardsBalance();
  const [panel, setPanel] = useState<Panel>(null);
  const [verifying, setVerifying] = useState(false);
  const [confirm, setConfirm] = useState<null | 'logout' | 'delete' | 'reset'>(null);
  const [draft, setDraft] = useState(profile);
  /** A photo the customer has picked or taken but not yet confirmed. Nothing is saved or uploaded until they tap Use photo. */
  const [pending, setPending] = useState<{ uri: string; source: 'library' | 'camera' } | null>(null);

  const activeCoupons = useMemo(() => coupons.filter((c) => evaluateCoupon(c, 1e9).eligible).length, [coupons]);
  const latest = orders[0];

  const sendVerification = async () => {
    if (verifying || !authApi.sendEmailVerification) return;
    setVerifying(true);
    try {
      const r = await authApi.sendEmailVerification();
      toast(r.alreadyVerified ? 'Your email is already verified' : `Verification link sent to ${user?.email}`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setVerifying(false);
    }
  };
  const openEdit = () => { setDraft(profile); setPending(null); setPanel('edit'); };
  const choosePhoto = async (src: 'library' | 'camera') => {
    const r = await pickImage(src, { square: true });
    if (r.ok === true) setPending({ uri: r.uri, source: src });
    else if (r.ok === false) toast(r.reason, 'error');
  };
  const saveProfile = () => {
    if (draft.name.trim().length < 2) return toast('Please enter your name', 'error');
    updateProfile(draft);
    setPanel(null);
    toast('Profile updated', 'success');
  };
  const invite = async () => {
    try { await Share.share({ message: `Try Shree Hari Sweets & Snacks (demo app). Use code ${DEMO_CONFIG.referralCode}.` }); }
    catch { toast('Sharing is not available here', 'info'); }
  };

  const rows = [
    { icon: 'location-outline', title: 'Saved Addresses', sub: `${addresses.length} Addresses`, onPress: () => nav.navigate('Addresses') },
    { icon: 'card-outline', title: 'Payment Methods', sub: 'UPI, Cards & More', onPress: () => setPanel('payments') },
    ...(api.account ? [{ icon: 'mail-unread-outline', title: 'Messages', sub: 'Updates from the store', onPress: () => nav.navigate('Inbox') }] : []),
    { icon: 'notifications-outline', title: 'Notifications', sub: 'Order, Offers & Updates', onPress: () => setPanel('notifications') },
    { icon: 'shield-checkmark-outline', title: 'Privacy & permissions', sub: 'Location, camera, notifications', onPress: () => setPanel('privacy') },
    { icon: 'headset-outline', title: 'Help & Support', sub: 'FAQs, Chat or Call Us', onPress: () => setPanel('help') },
    { icon: 'information-circle-outline', title: 'About Shree Hari', sub: 'Our Story, Stores & More', onPress: () => setPanel('about') },
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader left="none" actions={['bell']} title="My Account">
        {!user ? (
          <View style={{ marginTop: 12, gap: 12 }}>
            <View style={styles.profile}>
              <View style={[styles.avatarRing, { width: 66, height: 66, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={32} color={colors.secondary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="h1" color={colors.text}>Welcome, guest</AppText>
                <AppText variant="body" color={colors.textMuted}>Log in for faster checkout</AppText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Log in" variant="primary" size="sm" onPress={() => nav.navigate('Login')} style={{ flex: 1 }} />
              <Button title="Sign up" variant="outline" size="sm" onPress={() => nav.navigate('Signup')} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
        <View style={styles.profile}>
          <View style={styles.avatarRing}>
            <AvatarFace uri={profile.photoUri} demo={user?.isDemo} name={profile.name} size={76} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 130, minWidth: 130 }}>
            <AppText variant="h1" color={colors.text} numberOfLines={2}>{profile.name}</AppText>
            <AppText variant="body" color={colors.textMuted} numberOfLines={1}>{profile.phone}</AppText>
            {!!user?.email && !!authApi.sendEmailVerification && (
              user.emailVerified ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <AppText variant="caption" color={colors.success} numberOfLines={1} style={{ flexShrink: 1 }}>Email verified</AppText>
                </View>
              ) : (
                <PressableScale onPress={sendVerification} disabled={verifying} accessibilityLabel="Send verification email" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, minHeight: 28 }}>
                  <Ionicons name="mail-unread-outline" size={16} color={colors.primary} />
                  <AppText variant="caption" color={colors.primary} weight="semi" numberOfLines={1} style={{ flexShrink: 1 }}>{verifying ? 'Sending…' : 'Verify email'}</AppText>
                </PressableScale>
              )
            )}
          </View>
          <PressableScale onPress={openEdit} accessibilityLabel="Edit profile" style={styles.editBtn}>
            <Ionicons name="pencil-outline" size={18} color={colors.secondary} />
            <AppText variant="weight" color={colors.secondary}>Edit Profile</AppText>
          </PressableScale>
        </View>
        )}
      </BrandHeader>

      <Sheet>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md, paddingBottom: layout.scrollBottom, gap: spacing.lg }}>
          <Reveal>
            <PressableScale onPress={() => nav.navigate('Offers')} accessibilityLabel="View rewards" style={styles.rewards}>
              <View style={styles.crown}><Ionicons name="ribbon" size={22} color={colors.primary} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="cardTitle" color={colors.primary}>Rewards</AppText>
                <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>Shree Hari member</AppText>
                {API_MODE === 'mock' && <View style={{ alignSelf: 'flex-start', marginTop: 2 }}><DemoTag /></View>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <AppText variant="cardTitle" color={colors.primary}>{points} Points</AppText>
                <AppText variant="caption" color={colors.textMuted}>≈ {rupee(rupees)} Savings</AppText>
              </View>
              <View style={styles.viewRewards}><AppText variant="captionMedium" color={colors.onAccent} >View Rewards ›</AppText></View>
            </PressableScale>
          </Reveal>

          <Reveal index={1}>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="cube-outline" size={28} color={colors.primary} />
                  <AppText variant="sectionTitle">My Orders</AppText>
                </View>
                <PressableScale onPress={() => nav.navigate('Main', { screen: 'Orders' })} accessibilityLabel="View all orders" style={{ minHeight: 44, justifyContent: 'center' }}>
                  <AppText variant="bodyMedium" color={colors.primary} weight="semi">View All Orders →</AppText>
                </PressableScale>
              </View>
              {latest ? (
                <PressableScale onPress={() => nav.navigate('OrderTracking', { orderId: latest.id })} accessibilityLabel={`Order ${latest.number}`} style={styles.latest}>
                  <ProductImage image={latest.items[0]?.imageUri ? { id: 'u', uri: latest.items[0].imageUri } : latest.items[0]?.imageKey} style={{ width: 82, height: 62, borderRadius: 12 }} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <AppText variant="cardTitle">Order #{latest.number}</AppText>
                    <AppText variant="body" color={colors.textMuted}>{latest.totals.itemCount} Items  •  {rupee(latest.totals.total)}</AppText>
                    <View style={{ alignSelf: 'flex-start' }}><StatusChip status={latest.status} /></View>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                </PressableScale>
              ) : (
                <AppText variant="body" color={colors.textMuted} style={{ padding: 16 }}>No orders yet.</AppText>
              )}
            </View>
          </Reveal>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { icon: 'heart-outline', t: 'Wishlist', s: `${wishlist.length} Items`, go: () => nav.navigate('Wishlist') },
              { icon: 'ticket-outline', t: 'Coupons', s: `${activeCoupons} Active`, go: () => nav.navigate('Offers') },
              { icon: 'layers-outline', t: 'Rewards', s: `${points} Points`, go: () => nav.navigate('Offers') },
              { icon: 'gift-outline', t: 'Referral', s: 'Invite', go: invite },
            ].filter((x) => API_MODE === 'mock' || x.t !== 'Referral').map((x, i) => (
              <Reveal key={x.t} index={i + 2} step={50} style={{ flex: 1 }}>
                <PressableScale onPress={x.go} accessibilityLabel={`${x.t}, ${x.s}`} style={styles.tile}>
                  <Ionicons name={x.icon as keyof typeof Ionicons.glyphMap} size={32} color={x.icon.startsWith('heart') ? colors.primary : x.icon.startsWith('gift') ? colors.accent : colors.secondary} />
                  <AppText variant="weight" align="center" style={{ marginTop: 6 }} numberOfLines={2}>{x.t}</AppText>
                  <AppText variant="caption" color={colors.textMuted} align="center" numberOfLines={2}>{x.s}</AppText>
                </PressableScale>
              </Reveal>
            ))}
          </View>

          <View style={styles.card}>
            {rows.map((r, i) => (
              <PressableScale key={r.title} onPress={r.onPress} accessibilityLabel={`${r.title}. ${r.sub}`} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <Ionicons name={r.icon as keyof typeof Ionicons.glyphMap} size={28} color={colors.secondary} />
                <View style={{ flex: 1 }}>
                  <AppText variant="cardTitle">{r.title}</AppText>
                  <AppText variant="body" color={colors.textMuted}>{r.sub}</AppText>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.primary} />
              </PressableScale>
            ))}
          </View>

          {!!user && <PressableScale onPress={() => setConfirm('logout')} accessibilityLabel="Logout" style={styles.logout}>
            <Ionicons name="log-out-outline" size={24} color={colors.primary} />
            <AppText variant="sectionTitle" color={colors.primary}>Logout</AppText>
          </PressableScale>}
        </ScrollView>
      </Sheet>

      <BottomSheet visible={panel === 'edit'} onClose={() => setPanel(null)} title="Edit profile">
        <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
          <View style={styles.avatarRing}><AvatarFace uri={pending?.uri ?? draft.photoUri} demo={!pending && user?.isDemo} name={draft.name} size={84} /></View>
          {pending ? (
            <View style={{ alignItems: 'center', gap: 8, marginTop: 10 }}>
              <AppText variant="caption" color={colors.textMuted} align="center">Preview. This photo is not saved until you tap Use photo.</AppText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Retake" size="sm" variant="outline" icon="refresh" onPress={() => choosePhoto(pending.source)} />
                <Button title="Use photo" size="sm" icon="checkmark" onPress={() => { setDraft((d) => ({ ...d, photoUri: pending.uri })); setPending(null); }} />
                <Button title="Cancel" size="sm" variant="ghost" onPress={() => setPending(null)} />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Button title="Gallery" size="sm" variant="soft" icon="images-outline" onPress={() => choosePhoto('library')} />
              <Button title="Camera" size="sm" variant="soft" icon="camera-outline" onPress={() => choosePhoto('camera')} />
              {draft.photoUri && <Button title="Remove" size="sm" variant="ghost" onPress={() => setDraft((d) => ({ ...d, photoUri: undefined }))} />}
            </View>
          )}
        </View>
        <Field label="Full name" value={draft.name} onChangeText={(t) => setDraft((d) => ({ ...d, name: t }))} />
        <Field label="Mobile number" value={draft.phone} onChangeText={(t) => setDraft((d) => ({ ...d, phone: t }))} keyboardType="phone-pad" />
        <Field label="Email (optional)" value={draft.email} onChangeText={(t) => setDraft((d) => ({ ...d, email: t }))} keyboardType="email-address" autoCapitalize="none" />
        <Button title="Save changes" onPress={saveProfile} />
      </BottomSheet>

      <BottomSheet visible={panel === 'payments'} onClose={() => setPanel(null)} title="Payment methods">
        <Note text={API_MODE === 'mock' ? 'This demo does not store any payment methods, card numbers or UPI IDs. At checkout you can pick UPI, card, wallet, net banking or COD — all simulated.' : 'No card numbers or UPI IDs are stored in the app. You choose how to pay at checkout.'} />
        <Button title="Got it" onPress={() => setPanel(null)} style={{ marginTop: spacing.lg }} />
      </BottomSheet>

      <BottomSheet visible={panel === 'notifications'} onClose={() => setPanel(null)} title="Notifications">
        <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
        <PermissionRow kind="notifications" />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <View style={{ paddingVertical: 12 }}>
          <AppText variant="h2">Order updates</AppText>
          <AppText variant="caption" color={colors.textMuted}>Confirmed, being prepared, on the way, delivered, cancellations and refunds. These are service messages about your own orders, so they have no switch. Turn them off with the phone permission above.</AppText>
        </View>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <ToggleRow label="Offers & new arrivals" sub={api.account ? 'Offers by push, SMS and WhatsApp. Off until you turn it on; change it any time.' : 'Promotional messages — you can opt out any time'} value={notif.offers} onChange={(v) => { setNotif('offers', v); if (api.account) api.account.setMarketingOptIn(v).catch(() => { setNotif('offers', !v); toast('Could not save this choice. Check your connection.', 'error'); }); }} />
        {!api.account && <Note text="Demo mode: your choices are saved on this device only. No notification is delivered from a demo store." />}
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={panel === 'privacy'} onClose={() => setPanel(null)} title="Privacy & permissions">
        <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
          <AppText variant="body" color={colors.textMuted} style={{ marginBottom: 4 }}>Shree Hari asks only when you use a feature that needs it, and explains why first. Nothing here is asked at app start.</AppText>
          <PermissionRow kind="location" />
          <PermissionRow kind="camera" />
          <PermissionRow kind="notifications" />
          <PhotosRow />
          <Note text="Not used: microphone, contacts, files, Bluetooth, background location. You can always type your address and PIN code instead of using location, and choose a photo instead of using the camera." />
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={panel === 'help'} onClose={() => setPanel(null)} title="Help & Support">
        <Note text="Support phone, chat and WhatsApp details, response times and escalation owners will be supplied by Shree Hari before launch." />
        <View style={{ gap: 10, marginTop: spacing.lg }}>
          <Button title="Request account deletion" variant="outline" icon="trash-outline" onPress={() => { setPanel(null); setTimeout(() => setConfirm('delete'), 300); }} />
          <Button title="Close" variant="ghost" onPress={() => setPanel(null)} />
        </View>
      </BottomSheet>

      <BottomSheet visible={panel === 'about'} onClose={() => setPanel(null)} title={API_MODE === 'mock' ? 'About this POC' : 'About'}>
        <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
          <Note text={API_MODE === 'mock'
            ? 'Shree Hari Sweets & Snacks — client proof of concept.\n\n• DEMO MODE: the catalogue, prices, ratings and rewards are built-in sample data and are not connected to the store.\n• Payments, delivery partner and notifications are simulated.\n• Data source: built-in mock service.'
            : `Shree Hari Sweets & Snacks.\n\n• Data source: live store backend.\n• Server: ${API_URL}\n• Catalogue version: ${catVersion ?? 'not loaded yet'}\n• Products, prices, stock and orders come from the store's database.`} />
          <View style={{ gap: 10, marginTop: spacing.lg }}>
            {API_MODE === 'mock' && <Button title="Manage product photos (demo)" icon="images-outline" variant="soft" onPress={() => { setPanel(null); nav.navigate('PhotoManager'); }} />}
            {API_MODE === 'mock' && <Button title="Reset demo data" variant="outline" icon="refresh" onPress={() => { setPanel(null); setTimeout(() => setConfirm('reset'), 300); }} />}
          </View>
        </ScrollView>
      </BottomSheet>

      <ConfirmDialog visible={confirm === 'logout'} title="Log out?" message="Your account data stays saved. Your cart will start empty as a guest." confirmLabel="Logout" onCancel={() => setConfirm(null)} onConfirm={async () => { setConfirm(null); await logoutAuth(); toast('Logged out'); }} />
      <ConfirmDialog visible={confirm === 'delete'} title="Request account deletion?" message="In the live app this starts the deletion process. In this demo nothing is sent." confirmLabel="Request" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); toast('Deletion request recorded (demo only)', 'info'); }} />
      <ConfirmDialog visible={confirm === 'reset'} title="Reset demo data?" message="Cart, wishlist, orders, addresses and profile go back to the starting demo state." confirmLabel="Reset" onCancel={() => setConfirm(null)} onConfirm={() => { resetDemo(); setConfirm(null); toast('Demo data reset', 'success'); }} />
    </View>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 14 }}>
      <AppText variant="body" color={colors.text} style={{ lineHeight: 21 }}>{text}</AppText>
    </View>
  );
}

function ToggleRow({ label, sub, value, onChange }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <View style={{ flex: 1 }}>
        <AppText variant="h2">{label}</AppText>
        <AppText variant="caption" color={colors.textMuted}>{sub}</AppText>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.white} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 12 },
  avatarRing: { padding: 3, borderRadius: 50, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 44, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.secondary },
  rewards: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: 12, ...shadow.card },
  crown: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  viewRewards: { width: '100%', backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, height: 40, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 8 },
  latest: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 12, marginTop: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  tile: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 4, minHeight: 100, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 64 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 60, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
});
