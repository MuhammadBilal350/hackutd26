import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  createAudioPlayer,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";

import {
  calculateComparison,
  formatMoney,
} from "../lib/finance";
import type { FinderResult } from "../lib/roadsideFinder";

const API_BASE = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");

type Vehicle = {
  year: string;
  make: string;
  model: string;
  mileage: string;
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

async function postJSON(path: string, body: unknown) {
  if (!API_BASE) {
    throw new Error(
      "Set EXPO_PUBLIC_API_URL to your Vercel deployment origin and restart Expo."
    );
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Server returned non-JSON (HTTP ${response.status}): ${raw.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }

  return data;
}

function moneyInput(value: string, fallback: number) {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function normalizePhotoForNvidia(
  dataUrl: string,
  mimeType: string | undefined
) {
  if (Platform.OS !== "web") {
    return `data:${mimeType || "image/jpeg"};base64,${dataUrl}`;
  }

  return new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const canvas = window.document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not prepare the photo for analysis."));
        return;
      }

      const scale = Math.min(
        1,
        2048 / image.naturalWidth,
        2048 / image.naturalHeight
      );
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      reject(new Error("Could not read the selected photo."));
    };
    image.src = `data:${mimeType || "image/jpeg"};base64,${dataUrl}`;
  });
}

function AppButton({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.secondaryButtonText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function NumberField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || "Enter value"}
        placeholderTextColor="#718096"
        keyboardType="decimal-pad"
        style={styles.input}
      />
    </View>
  );
}

export default function HomeScreen() {
  const [vehicle, setVehicle] = useState<Vehicle>({
    year: "2020",
    make: "Toyota",
    model: "Camry",
    mileage: "65000",
  });

  const [imageUri, setImageUri] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [question, setQuestion] = useState(
    "Analyze this vehicle and help me decide whether to keep it or replace it."
  );

  const [analysis, setAnalysis] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mapResult, setMapResult] = useState<FinderResult | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [speechBase64, setSpeechBase64] = useState("");
  const [speechBusy, setSpeechBusy] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("");

  const [originalPrice, setOriginalPrice] = useState("28000");
  const [currentValue, setCurrentValue] = useState("16000");
  const [repairs, setRepairs] = useState("250");
  const [currentMaintenance, setCurrentMaintenance] = useState("700");
  const [currentResale, setCurrentResale] = useState("5000");

  const [newPrice, setNewPrice] = useState("32000");
  const [downPayment, setDownPayment] = useState("3000");
  const [apr, setApr] = useState("6.5");
  const [loanTerm, setLoanTerm] = useState("60");
  const [newMaintenance, setNewMaintenance] = useState("500");
  const [newResale, setNewResale] = useState("10000");
  const [leaseMonthly, setLeaseMonthly] = useState("399");
  const [leaseTerm, setLeaseTerm] = useState("36");
  const [leaseDueAtSigning, setLeaseDueAtSigning] = useState("2500");

  const recorder = useAudioRecorder(
    RecordingPresets.HIGH_QUALITY
  );

  const [audioPlayer, setAudioPlayer] = useState<any>(null);
  const webAudioPlayer = useRef<HTMLAudioElement | null>(null);

  const comparison = calculateComparison({
    currentValue: moneyInput(currentValue, 16000),
    currentRepairsMonthly: moneyInput(repairs, 250),
    currentMaintenanceYearly: moneyInput(
      currentMaintenance,
      700
    ),
    currentResaleAfterTenYears: moneyInput(
      currentResale,
      5000
    ),
    newVehiclePrice: moneyInput(newPrice, 32000),
    downPayment: moneyInput(downPayment, 3000),
    apr: moneyInput(apr, 6.5),
    loanTermMonths: moneyInput(loanTerm, 60),
    newMaintenanceYearly: moneyInput(newMaintenance, 500),
    newResaleAfterTenYears: moneyInput(newResale, 10000),
    leaseMonthlyPayment: moneyInput(leaseMonthly, 399),
    leaseTermMonths: moneyInput(leaseTerm, 36),
    leaseDueAtSigning: moneyInput(leaseDueAtSigning, 2500),
  });

  useEffect(() => {
    return () => {
      try {
        audioPlayer?.remove();
      } catch {
        // Ignore cleanup errors.
      }
      webAudioPlayer.current?.pause();
      webAudioPlayer.current = null;
    };
  }, [audioPlayer]);

  async function choosePhoto(useCamera: boolean) {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Allow access to your camera or photo library."
        );
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            base64: true,
            quality: 0.5,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            base64: true,
            quality: 0.5,
          });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        throw new Error("Could not read the selected image.");
      }

      if (asset.base64.length > 3_500_000) {
        throw new Error(
          "This image is too large to upload. Please choose a smaller or lower-resolution photo."
        );
      }

      const mime = asset.mimeType || "image/jpeg";
      const normalizedPhoto = await normalizePhotoForNvidia(
        asset.base64,
        mime
      );

      setImageUri(asset.uri);
      setImageDataUrl(normalizedPhoto);
      setAnalysis("");
    } catch (error) {
      Alert.alert(
        "Photo error",
        error instanceof Error ? error.message : "Could not select photo."
      );
    }
  }

  async function analyzeVehicle(
    questionOverride?: string,
    speakResponse = autoSpeak
  ) {
    const userQuestion = (questionOverride ?? question).trim();
    if (!userQuestion && !imageDataUrl) {
      Alert.alert("Add a question", "Ask about your vehicle or add a photo.");
      return;
    }

    setBusy(true);
    setAnalysis("");
    setAssistantError("");

    try {
      let nearbyServices = "";
      if (
        /\b(nearby|nearest|close to me|workshop|service center|dealership|mechanic|repair shop|tow|roadside)\b/i.test(
          userQuestion
        )
      ) {
        setMapLoading(true);
        try {
          const finder = await import("../lib/roadsideFinder");
          const result = await finder.findNearestToyotaCenter();
          setMapResult(result);
          nearbyServices = JSON.stringify({
            nearest: result.nearest,
            otherOptions: result.centers.slice(1, 5),
            usedFallback: result.usedFallback,
            note: "Toyota authorization is unverified.",
          });
        } catch (error) {
          nearbyServices = `Location lookup failed: ${
            error instanceof Error ? error.message : "Unknown location error."
          }`;
        } finally {
          setMapLoading(false);
        }
      }

      const currentPurchasePrice = moneyInput(originalPrice, 28000);
      const currentMarketValue = moneyInput(currentValue, 16000);
      const data = await postJSON("/api/analyze", {
        message: userQuestion,
        imageDataUrl: imageDataUrl || undefined,
        vehicle,
        comparison: {
          ...comparison,
          currentOriginalPrice: currentPurchasePrice,
          currentEstimatedValue: currentMarketValue,
          estimatedValueLoss: Math.max(
            0,
            currentPurchasePrice - currentMarketValue
          ),
        },
        nearbyServices,
        history: conversation.slice(-8),
      });

      setAnalysis(data.answer);
      setSpeechBase64("");
      setSpeechStatus("");
      setConversation((previous): ConversationMessage[] =>
        [
          ...previous,
          {
            role: "user" as const,
            content: userQuestion || "Review this photo.",
          },
          { role: "assistant" as const, content: data.answer },
        ].slice(-8)
      );
      if (speakResponse && data.answer) {
        await generateSpeech(data.answer);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Analysis failed.";
      setAssistantError(message);
      Alert.alert(
        "Analysis error",
        message
      );
    } finally {
      setMapLoading(false);
      setBusy(false);
    }
  }

  async function generateSpeech(text: string) {
    setSpeechBusy(true);
    setSpeechStatus("Preparing spoken answer…");

    try {
      const data = await postJSON("/api/speak", { text });
      if (typeof data.audioBase64 !== "string" || !data.audioBase64) {
        throw new Error("The speech service returned no audio.");
      }

      setSpeechBase64(data.audioBase64);
      await playSpeech(data.audioBase64);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not generate speech.";
      setSpeechStatus(message);
      setAssistantError(message);
      Alert.alert(
        "Voice error",
        message
      );
    } finally {
      setSpeechBusy(false);
    }
  }

  async function playSpeech(base64 = speechBase64) {
    if (!base64) {
      setSpeechStatus("There is no spoken answer to play yet.");
      return;
    }

    if (Platform.OS === "web") {
      try {
        webAudioPlayer.current?.pause();
        const player = new Audio(`data:audio/mpeg;base64,${base64}`);
        webAudioPlayer.current = player;
        await player.play();
        setSpeechStatus("Speaking…");
      } catch {
        setSpeechStatus(
          "Playback was blocked. Tap “Play spoken answer” and check your device volume."
        );
      }
      return;
    }

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      const fileUri =
        `${FileSystem.cacheDirectory}toyota-response.mp3`;

      await FileSystem.writeAsStringAsync(
        fileUri,
        base64,
        {
          encoding: FileSystem.EncodingType.Base64,
        }
      );

      try {
        audioPlayer?.remove();
      } catch {
        // Ignore previous player cleanup.
      }

      const player = createAudioPlayer(fileUri);
      setAudioPlayer(player);
      player.play();
      setSpeechStatus("Speaking…");
    } catch (error) {
      setSpeechStatus("Speech could not be played.");
      Alert.alert(
        "Voice error",
        error instanceof Error ? error.message : "Could not play response."
      );
    }
  }

  async function startRecording() {
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (error) {
      Alert.alert(
        "Microphone error",
        error instanceof Error ? error.message : "Could not start recording."
      );
    }
  }

  async function stopRecording() {
    try {
      await recorder.stop();
      setRecording(false);

      const uri = recorder.uri;

      if (!uri) {
        throw new Error("Recording file was not created.");
      }

      const fileResponse = await fetch(uri);
      const audioBuffer = await fileResponse.arrayBuffer();

      const bytes = new Uint8Array(audioBuffer);
      let binary = "";

      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      const audioBase64 = btoa(binary);

      const data = await postJSON("/api/transcribe", {
        audioBase64,
        mimeType: Platform.OS === "web" ? "audio/webm" : "audio/m4a",
      });

      if (data.text) {
        setQuestion(data.text);
        await analyzeVehicle(data.text, true);
      } else {
        const message = "No speech was detected. Please try again.";
        setAssistantError(message);
        Alert.alert("No speech detected", message);
      }
    } catch (error) {
      setRecording(false);
      const message =
        error instanceof Error ? error.message : "Could not transcribe.";
      setAssistantError(message);
      Alert.alert(
        "Transcription error",
        message
      );
    }
  }

  
async function findNearbyService() {
  setMapLoading(true);
  setMapResult(null);

  try {
    const finder = await import("../lib/roadsideFinder");
    const result = await finder.findNearestToyotaCenter();

    // Show the results immediately.
    setMapResult(result);

    // Save the results to SpacetimeDB through Vercel.
    const response = await fetch("/api/service-centers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ centers: result.centers }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const saved = await response.json();
    console.log("SpacetimeDB save result:", saved);
  } catch (error) {
    console.error("Nearby service error:", error);
    Alert.alert(
      "Nearby Service",
      error instanceof Error ? error.message : "Something went wrong."
    );
  } finally {
    setMapLoading(false);
  }
}


  const estimatedValueLoss = Math.max(
    0,
    moneyInput(originalPrice, 28000) - moneyInput(currentValue, 16000)
  );
  const maxCost = Math.max(
    comparison.keepTotal,
    comparison.replacementTotal,
    comparison.leaseTotal,
    1
  );

  const keepBar = Math.max(
    3,
    (comparison.keepTotal / maxCost) * 100
  );

  const replaceBar = Math.max(
    3,
    (comparison.replacementTotal / maxCost) * 100
  );
  const leaseBar = Math.max(3, (comparison.leaseTotal / maxCost) * 100);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>TOYOTA</Text>
        <Text style={styles.headerSubtitle}>
          VEHICLE DECISION ASSISTANT
        </Text>
        <Text style={styles.heading}>
          Keep it or replace it?
        </Text>
        <Text style={styles.subheading}>
          Understand your vehicle, compare your costs, and make
          a confident decision.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>01 / YOUR VEHICLE</Text>

        <View style={styles.twoColumns}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Year</Text>
            <TextInput
              value={vehicle.year}
              onChangeText={(v) =>
                setVehicle({ ...vehicle, year: v })
              }
              style={styles.input}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Mileage</Text>
            <TextInput
              value={vehicle.mileage}
              onChangeText={(v) =>
                setVehicle({ ...vehicle, mileage: v })
              }
              style={styles.input}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <View style={styles.twoColumns}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Make</Text>
            <TextInput
              value={vehicle.make}
              onChangeText={(v) =>
                setVehicle({ ...vehicle, make: v })
              }
              style={styles.input}
            />
          </View>

          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Model</Text>
            <TextInput
              value={vehicle.model}
              onChangeText={(v) =>
                setVehicle({ ...vehicle, model: v })
              }
              style={styles.input}
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Vehicle photo</Text>
        <Text style={styles.muted}>
          Add an exterior photo or a clear dashboard photo with the engine
          running. Photos cannot confirm hidden mechanical condition.
        </Text>

        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.vehicleImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoIcon}>＋</Text>
            <Text style={styles.muted}>
              Add an exterior or dashboard photo
            </Text>
          </View>
        )}

        <View style={styles.twoColumns}>
          <View style={styles.halfField}>
            <AppButton
              title="Take photo"
              onPress={() => choosePhoto(true)}
              secondary
            />
          </View>
          <View style={styles.halfField}>
            <AppButton
              title="Choose photo"
              onPress={() => choosePhoto(false)}
              secondary
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Ask your assistant</Text>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          multiline
          style={[styles.input, styles.questionInput]}
          placeholder="Ask about your vehicle..."
          placeholderTextColor="#718096"
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: autoSpeak }}
          onPress={() => setAutoSpeak((enabled) => !enabled)}
          style={styles.voiceToggle}
        >
          <Text style={styles.voiceToggleText}>
            {autoSpeak ? "☑" : "☐"}  Speak each assistant reply
          </Text>
        </Pressable>

        <View style={styles.twoColumns}>
          <View style={styles.halfField}>
            <AppButton
              title={busy ? "Analyzing..." : "Analyze vehicle"}
              onPress={() => analyzeVehicle()}
              disabled={busy}
            />
          </View>
          <View style={styles.halfField}>
            <AppButton
              title={
                recording
                  ? "Stop & send"
                  : "Ask by voice"
              }
              onPress={recording ? stopRecording : startRecording}
              secondary
            />
          </View>
        </View>

        {busy && (
          <ActivityIndicator
            color="#55D6BE"
            style={styles.loader}
          />
        )}

        {assistantError ? (
          <View style={styles.errorBox}>
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {assistantError}
            </Text>
          </View>
        ) : null}

        {analysis ? (
          <View style={styles.answerBox}>
            <Text style={styles.answerTitle}>
              VEHICLE ASSISTANT
            </Text>
            <Text style={styles.answerText}>{analysis}</Text>
            <AppButton
              title={
                speechBusy
                  ? "Preparing voice…"
                  : speechBase64
                    ? "Play spoken answer"
                    : "Generate spoken answer"
              }
              onPress={() =>
                speechBase64 ? playSpeech() : generateSpeech(analysis)
              }
              disabled={speechBusy}
              secondary
            />
            {speechStatus ? (
              <Text accessibilityLiveRegion="polite" style={styles.muted}>
                {speechStatus}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          02 / FINANCIAL COMPARISON
        </Text>

        <Text style={styles.muted}>
          Edit these assumptions to calculate your estimated
          10-year costs.
        </Text>

        <Text style={styles.subsectionTitle}>
          KEEP CURRENT VEHICLE
        </Text>

        <NumberField
          label="Original purchase price when new ($)"
          value={originalPrice}
          onChangeText={setOriginalPrice}
        />
        <NumberField
          label="Current vehicle value ($)"
          value={currentValue}
          onChangeText={setCurrentValue}
        />
        <NumberField
          label="Expected repairs per month ($)"
          value={repairs}
          onChangeText={setRepairs}
        />
        <NumberField
          label="Maintenance per year ($)"
          value={currentMaintenance}
          onChangeText={setCurrentMaintenance}
        />
        <NumberField
          label="Estimated resale value in 10 years ($)"
          value={currentResale}
          onChangeText={setCurrentResale}
        />

        <View style={styles.divider} />

        <Text style={styles.subsectionTitle}>
          REPLACE WITH NEW VEHICLE
        </Text>

        <NumberField
          label="New vehicle price ($)"
          value={newPrice}
          onChangeText={setNewPrice}
        />
        <NumberField
          label="Down payment ($)"
          value={downPayment}
          onChangeText={setDownPayment}
        />
        <NumberField
          label="Estimated APR (%)"
          value={apr}
          onChangeText={setApr}
        />
        <NumberField
          label="Loan term (months)"
          value={loanTerm}
          onChangeText={setLoanTerm}
        />
        <NumberField
          label="New vehicle maintenance per year ($)"
          value={newMaintenance}
          onChangeText={setNewMaintenance}
        />
        <NumberField
          label="Estimated resale value in 10 years ($)"
          value={newResale}
          onChangeText={setNewResale}
        />

        <View style={styles.divider} />

        <Text style={styles.subsectionTitle}>
          LEASE A REPLACEMENT
        </Text>
        <Text style={styles.muted}>
          Enter an actual offer if you have one. Lease estimates assume
          continuous leases across 10 years and do not include mileage,
          disposition, or excess-wear fees.
        </Text>
        <NumberField
          label="Estimated lease payment per month ($)"
          value={leaseMonthly}
          onChangeText={setLeaseMonthly}
        />
        <NumberField
          label="Lease term (months)"
          value={leaseTerm}
          onChangeText={setLeaseTerm}
        />
        <NumberField
          label="Upfront fees per lease, excluding monthly payment ($)"
          value={leaseDueAtSigning}
          onChangeText={setLeaseDueAtSigning}
        />

        <View style={styles.resultPanel}>
          <Text style={styles.answerTitle}>
            ESTIMATED CURRENT VEHICLE VALUE LOSS
          </Text>
          <Text style={styles.bigNumber}>
            {formatMoney(estimatedValueLoss)}
          </Text>
          <Text style={styles.muted}>
            Based only on your entered original price and current value;
            this is not a market valuation.
          </Text>

          <View style={styles.divider} />
          <Text style={styles.answerTitle}>
            ESTIMATED MONTHLY LOAN PAYMENT
          </Text>
          <Text style={styles.bigNumber}>
            {formatMoney(comparison.monthlyPayment)}
          </Text>

          <Text style={styles.resultLabel}>
            Estimated 10-year cost: keep
          </Text>
          <Text style={styles.resultNumber}>
            {formatMoney(comparison.keepTotal)}
          </Text>

          <View style={styles.barBackground}>
            <View
              style={[
                styles.bar,
                { width: `${keepBar}%`, backgroundColor: "#55D6BE" },
              ]}
            />
          </View>

          <Text style={styles.resultLabel}>
            Estimated 10-year cost: replace
          </Text>
          <Text style={styles.resultNumber}>
            {formatMoney(comparison.replacementTotal)}
          </Text>

          <View style={styles.barBackground}>
            <View
              style={[
                styles.bar,
                { width: `${replaceBar}%`, backgroundColor: "#8D7CFF" },
              ]}
            />
          </View>

          <Text style={styles.resultLabel}>
            Estimated 10-year cost: lease
          </Text>
          <Text style={styles.resultNumber}>
            {formatMoney(comparison.leaseTotal)}
          </Text>
          <View style={styles.barBackground}>
            <View
              style={[
                styles.bar,
                { width: `${leaseBar}%`, backgroundColor: "#FFB86B" },
              ]}
            />
          </View>

          <Text style={styles.recommendation}>
            {comparison.recommendation}
          </Text>
          <Text style={styles.muted}>
            Keep-versus-loan estimate difference:{" "}
            {formatMoney(Math.abs(comparison.difference))}
          </Text>
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Loan estimate: {formatMoney(comparison.monthlyPayment)}/month.
            Lease estimate: {formatMoney(moneyInput(leaseMonthly, 399))}/month
            before fees, mileage limits, and other lease charges.
          </Text>
        </View>

        <Text style={styles.disclaimer}>
          Estimates only. This is not a dealer quote, guaranteed
          resale value, credit decision, or financial advice.
          Verify vehicle values, financing, fees, and ownership
          expenses before deciding.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          03 / NEARBY SERVICE
        </Text>

        <Text style={styles.muted}>
          Find nearby Toyota-related service options using your
          existing location finder.
        </Text>

        <AppButton
          title={
            mapLoading
              ? "Searching..."
              : "Find nearby service"
          }
          onPress={findNearbyService}
          disabled={mapLoading}
        />

        {mapResult?.nearest ? (
          <View style={styles.answerBox}>
            <Text style={styles.answerTitle}>
              NEAREST RESULT
            </Text>
            <Text style={styles.resultNumber}>
              {mapResult.nearest.name}
            </Text>
            <Text style={styles.answerText}>
              {mapResult.nearest.address}
            </Text>
            <Text style={styles.muted}>
              {mapResult.nearest.drivingDistanceMiles != null
                ? `${mapResult.nearest.drivingDistanceMiles.toFixed(1)} driving miles`
                : `${mapResult.nearest.distanceMiles.toFixed(1)} miles`}
            </Text>
            {mapResult.usedFallback ? (
              <Text style={styles.disclaimer}>
                No Toyota-related listing was found. This is a
                nearby repair-shop fallback, not a verified
                official Toyota center.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <Text style={styles.footer}>
        TOYOTA DECISION ASSISTANT · DEMO
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#080D18",
  },
  content: {
    padding: 18,
    paddingTop: 55,
    paddingBottom: 70,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    marginBottom: 24,
  },
  brand: {
    color: "#55D6BE",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 5,
  },
  headerSubtitle: {
    color: "#8292A8",
    fontSize: 10,
    letterSpacing: 3,
    marginTop: 5,
  },
  heading: {
    color: "#F4F7FC",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 25,
  },
  subheading: {
    color: "#A5B1C2",
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },
  card: {
    backgroundColor: "#111A2A",
    borderColor: "#26354B",
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
    marginBottom: 18,
  },
  sectionTitle: {
    color: "#55D6BE",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 17,
  },
  subsectionTitle: {
    color: "#D9E3F0",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 20,
    marginBottom: 12,
  },
  field: {
    marginTop: 12,
  },
  fieldLabel: {
    color: "#A5B1C2",
    fontSize: 12,
    marginBottom: 7,
  },
  input: {
    color: "#F4F7FC",
    backgroundColor: "#0A1220",
    borderColor: "#2A3A50",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    minWidth: 0,
  },
  questionInput: {
    minHeight: 85,
    textAlignVertical: "top",
  },
  voiceToggle: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  voiceToggleText: {
    color: "#A5B1C2",
    fontSize: 13,
  },
  twoColumns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  halfField: {
    flex: 1,
    minWidth: 0,
  },
  button: {
    backgroundColor: "#55D6BE",
    borderRadius: 10,
    padding: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  secondaryButton: {
    backgroundColor: "#1A2940",
    borderColor: "#3B506D",
    borderWidth: 1,
  },
  disabledButton: {
    opacity: 0.55,
  },
  buttonText: {
    color: "#06131A",
    fontWeight: "800",
    fontSize: 13,
  },
  secondaryButtonText: {
    color: "#D9E3F0",
  },
  photoPlaceholder: {
    minHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#34455E",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A1220",
  },
  photoIcon: {
    color: "#55D6BE",
    fontSize: 32,
  },
  vehicleImage: {
    width: "100%",
    height: 190,
    borderRadius: 12,
  },
  muted: {
    color: "#8C9CB1",
    fontSize: 12,
    lineHeight: 19,
  },
  loader: {
    marginTop: 15,
  },
  answerBox: {
    marginTop: 17,
    padding: 14,
    backgroundColor: "#0A1422",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2B4659",
  },
  errorBox: {
    marginTop: 14,
    padding: 12,
    backgroundColor: "#2A171D",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#7A3442",
  },
  errorText: {
    color: "#FFB3BE",
    fontSize: 13,
    lineHeight: 20,
  },
  answerTitle: {
    color: "#55D6BE",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 10,
  },
  answerText: {
    color: "#E2EAF4",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#2A3A50",
    marginTop: 20,
  },
  resultPanel: {
    backgroundColor: "#0A1422",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#30445E",
    padding: 15,
    marginTop: 20,
  },
  bigNumber: {
    color: "#F4F7FC",
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 18,
  },
  resultLabel: {
    color: "#A5B1C2",
    fontSize: 12,
    marginTop: 10,
  },
  resultNumber: {
    color: "#F4F7FC",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 5,
  },
  barBackground: {
    height: 9,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#25344A",
    marginTop: 9,
  },
  bar: {
    height: "100%",
    borderRadius: 10,
  },
  recommendation: {
    color: "#55D6BE",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 22,
    marginTop: 22,
  },
  disclaimer: {
    color: "#8494A9",
    fontSize: 11,
    lineHeight: 18,
    marginTop: 13,
  },
  footer: {
    color: "#53647B",
    fontSize: 10,
    letterSpacing: 2,
    textAlign: "center",
    marginTop: 10,
  },
});