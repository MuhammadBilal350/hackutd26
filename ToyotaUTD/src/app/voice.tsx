import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from '@elevenlabs/react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getToyotaVoiceToken } from '@/lib/spacetime';
import { deleteStoredValue, getStoredValue, setStoredValue } from '@/lib/secure-storage';

type ChatLine = { id: string; role: 'user' | 'agent'; message: string };

function ToyotaVoiceAssistant() {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [memory, setMemory] = useState('');
  const [savedMemory, setSavedMemory] = useState('');
  const [chat, setChat] = useState<ChatLine[]>([]);

  useEffect(() => {
    void getStoredValue('toyota-voice-memory').then(value => {
      if (value) {
        setMemory(value);
        setSavedMemory(value);
      }
    });
  }, []);

  useEffect(() => {
    if (status !== 'connecting') return;
    const timeout = setTimeout(() => {
      setError('Connection timed out. Check microphone access and internet, then try again.');
      endSession();
    }, 25000);
    return () => clearTimeout(timeout);
  }, [endSession, status]);

  const handleMessage = useCallback((line: { role: 'user' | 'agent'; message: string }) => {
    setChat(previous => [...previous.slice(-19), { ...line, id: `${Date.now()}-${Math.random()}` }]);
  }, []);

  const toggleConversation = async () => {
    setError('');
    if (status === 'connected' || status === 'connecting') {
      endSession();
      return;
    }
    setLoading(true);
    try {
      const conversationToken = await getToyotaVoiceToken();
      startSession({
        conversationToken,
        connectionType: 'webrtc',
        dynamicVariables: { previous_memory: savedMemory || 'No saved note.' },
        onMessage: handleMessage,
        onError: message => setError(message),
      });
    } catch {
      setError('Could not connect to the Toyota assistant. Check the backend setup and try again.');
    } finally {
      setLoading(false);
    }
  };

  const saveMemory = async () => {
    const trimmed = memory.trim().slice(0, 500);
    setMemory(trimmed);
    setSavedMemory(trimmed);
    if (trimmed) {
      await setStoredValue('toyota-voice-memory', trimmed);
    } else {
      await deleteStoredValue('toyota-voice-memory');
    }
  };

  const connected = status === 'connected';
  const sessionActive = status === 'connected' || status === 'connecting';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>TOYOTA OWNERSHIP GUIDE</Text>
        <Text style={styles.title}>Keep it or swap it?</Text>
        <Text style={styles.subtitle}>
          Talk through your options. The assistant gives general guidance and won’t invent vehicle or financing estimates.
        </Text>

        <View style={styles.voiceCard}>
          <View style={[styles.orb, connected && styles.orbActive]}>
            <Text style={styles.orbText}>{connected ? '●' : '✦'}</Text>
          </View>
          <Text style={styles.status}>
            {loading || status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Connection problem' : connected ? 'Listening and ready' : 'Your Toyota voice assistant'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void toggleConversation()}
            disabled={loading}
            style={({ pressed }) => [styles.button, connected && styles.endButton, pressed && styles.pressed]}>
            {loading ? <ActivityIndicator color="#06100d" /> : <Text style={styles.buttonText}>{sessionActive ? 'End conversation' : 'Start talking'}</Text>}
          </Pressable>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your conversation</Text>
          {chat.length === 0 ? (
            <Text style={styles.muted}>Try: “Should I keep my Camry or look at a new one?”</Text>
          ) : chat.map(line => (
            <View key={line.id} style={[styles.message, line.role === 'user' ? styles.userMessage : styles.agentMessage]}>
              <Text style={styles.messageLabel}>{line.role === 'user' ? 'YOU' : 'TOYOTA ASSISTANT'}</Text>
              <Text style={styles.messageText}>{line.message}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remember a car detail</Text>
          <Text style={styles.muted}>Saved on this device and shared with the assistant when you start. Don’t include your plate, VIN, or personal information.</Text>
          <TextInput
            accessibilityLabel="Optional note for future Toyota voice conversations"
            value={memory}
            onChangeText={setMemory}
            placeholder="For example: 2018 Camry, about 82,000 miles"
            placeholderTextColor="#75847f"
            maxLength={500}
            multiline
            style={styles.input}
          />
          <Pressable onPress={() => void saveMemory()} style={styles.saveButton}>
            <Text style={styles.saveText}>{savedMemory ? 'Save updated note' : 'Save note on this device'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function VoiceScreen() {
  return <ConversationProvider><ToyotaVoiceAssistant /></ConversationProvider>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07110f' },
  content: { padding: 22, gap: 22, maxWidth: 680, width: '100%', alignSelf: 'center' },
  eyebrow: { color: '#71e7a4', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 10 },
  title: { color: '#f4fbf7', fontSize: 32, fontWeight: '800', letterSpacing: -1.1 },
  subtitle: { color: '#a9b8b2', fontSize: 15, lineHeight: 22, marginTop: -12 },
  voiceCard: { alignItems: 'center', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#214238', backgroundColor: '#0d1d18', gap: 16 },
  orb: { width: 98, height: 98, borderRadius: 49, alignItems: 'center', justifyContent: 'center', backgroundColor: '#13372a', borderWidth: 1, borderColor: '#347353' },
  orbActive: { backgroundColor: '#1d6742', borderColor: '#71e7a4' },
  orbText: { color: '#8df0b2', fontSize: 34 },
  status: { color: '#effaf3', fontSize: 16, fontWeight: '700' },
  button: { minHeight: 50, minWidth: 190, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8df0b2' },
  endButton: { backgroundColor: '#ff8b81' },
  pressed: { opacity: 0.78 },
  buttonText: { color: '#07110f', fontWeight: '800', fontSize: 15 },
  error: { color: '#ffaaa3', textAlign: 'center' },
  section: { gap: 12, padding: 18, borderRadius: 20, backgroundColor: '#0d1a17', borderWidth: 1, borderColor: '#1c312a' },
  sectionTitle: { color: '#f4fbf7', fontSize: 18, fontWeight: '700' },
  muted: { color: '#a9b8b2', fontSize: 14, lineHeight: 20 },
  message: { padding: 12, borderRadius: 14, gap: 5 },
  userMessage: { backgroundColor: '#183126', alignSelf: 'flex-end', maxWidth: '90%' },
  agentMessage: { backgroundColor: '#14231f', alignSelf: 'flex-start', maxWidth: '90%' },
  messageLabel: { color: '#71e7a4', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  messageText: { color: '#eef7f1', fontSize: 14, lineHeight: 20 },
  input: { minHeight: 78, color: '#eef7f1', backgroundColor: '#07110f', borderWidth: 1, borderColor: '#29463a', borderRadius: 12, padding: 12, textAlignVertical: 'top' },
  saveButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#397151', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 15 },
  saveText: { color: '#9cf2bb', fontWeight: '700' },
});
