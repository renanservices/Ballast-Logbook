import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

/*
  BALLAST TANK DEPTH LOGBOOK
  --------------------------
  Single-file React JSX application.

  Features:
  - Tank setup
  - Tank height
  - Add / edit / delete tanks
  - Delete confirmation
  - Tank reordering
  - Sounding entries
  - Meter / centimeter input
  - Automatic fill percentage
  - Date/time with manual override
  - Recorded by / rank
  - Remarks
  - Edit/delete log entries
  - Delete confirmation
  - History filtering
  - Tank filtering
  - Depth trend graph
  - Light / true-black dark mode
  - LocalStorage offline persistence
  - JSON backup / restore
  - CSV export
  - Print-friendly PDF export through browser print
  - Data integrity with unique IDs and creation timestamps
*/

const STORAGE_KEYS = {
  ships: "ballast_logbook_ships_v1",
  selectedShip: "ballast_logbook_selected_ship_v1",
  tanks: "ballast_logbook_tanks_v1",
  logs: "ballast_logbook_logs_v1",
  settings: "ballast_logbook_settings_v1",
};

const defaultShips = [
  { id: "ship-1", name: "My Ship", imoNumber: "", callSign: "" },
];

const defaultTanks = [
  { id: "tank-1", shipId: "ship-1", name: "Fore Peak", height: 5.0, unit: "m", order: 0 },
  { id: "tank-2", shipId: "ship-1", name: "No.1 Port", height: 5.0, unit: "m", order: 1 },
  { id: "tank-3", shipId: "ship-1", name: "No.1 Stbd", height: 5.0, unit: "m", order: 2 },
  { id: "tank-4", shipId: "ship-1", name: "No.2 Port", height: 5.0, unit: "m", order: 3 },
  { id: "tank-5", shipId: "ship-1", name: "No.2 Stbd", height: 5.0, unit: "m", order: 4 },
  { id: "tank-6", shipId: "ship-1", name: "Aft Peak", height: 5.0, unit: "m", order: 5 },
];

function makeId(prefix = "id") {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
}

function getNowDateTime() {
  const now = new Date();

  const date =
    String(now.getFullYear()) +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0");

  const time =
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0");

  return { date, time };
}

function loadStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const [ships, setShips] = useState([]);

  const [selectedShipId, setSelectedShipId] = useState("");

  const [shipForm, setShipForm] = useState({
    name: "",
    imoNumber: "",
    callSign: "",
    password: "",
  });

  const [editingShipId, setEditingShipId] = useState(null);

  const [tanks, setTanks] = useState([]);

  const [logs, setLogs] = useState([]);

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [authMode, setAuthMode] = useState("login");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupNotice, setSignupNotice] = useState("");
  const [signingUp, setSigningUp] = useState(false);

  const [settings, setSettings] = useState(() =>
    loadStorage(STORAGE_KEYS.settings, {
      darkMode: false,
      defaultUnit: "m",
      crewName: "",
    })
  );

  const [page, setPage] = useState("home");

  const [tankForm, setTankForm] = useState({
    name: "",
    height: "",
    unit: "m",
  });

  const [editingTankId, setEditingTankId] = useState(null);

  const [soundingForm, setSoundingForm] = useState(() => {
    const now = getNowDateTime();

    return {
      tankId: "",
      date: now.date,
      time: now.time,
      depth: "",
      unit: "m",
      recordedBy: "",
      remarks: "",
    };
  });

  const [editingLogId, setEditingLogId] = useState(null);

  const [historyTank, setHistoryTank] = useState("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  const [selectedTrendTank, setSelectedTrendTank] = useState("");

  const [confirmDialog, setConfirmDialog] = useState(null);

  const [statusMessage, setStatusMessage] = useState("");

  const [joinShipName, setJoinShipName] = useState("");
  const [joinShipPassword, setJoinShipPassword] = useState("");
  const [joinShipError, setJoinShipError] = useState("");
  const [joiningShip, setJoiningShip] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setUser(data.session?.user || null);
        setAuthLoading(false);
      }
    }

    restoreSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session) {
        setProfile(null);
        setShips([]);
        setTanks([]);
        setLogs([]);
        setSelectedShipId("");
      }
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function loadOnlineData(currentUser) {
    if (!currentUser) return;

    setDataLoading(true);
    setLoginError("");

    try {
      // ============================================
      // LOAD USER PROFILE
      // ============================================
      const {
        data: profileRow,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("id, full_name, rank, role")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) throw profileError;
      setProfile(profileRow);

      // ============================================
      // LOAD SHIPS ASSIGNED TO CURRENT USER
      // ============================================
      // Query ship_members first, then query ships separately.
      // This avoids relying on a nested Supabase relationship.
      const {
        data: memberships,
        error: membershipError,
      } = await supabase
        .from("ship_members")
        .select("ship_id")
        .eq("user_id", currentUser.id);

      if (membershipError) throw membershipError;

      const shipIds = (memberships || [])
        .map((row) => Number(row.ship_id))
        .filter(Number.isFinite);

      console.log("================================");
      console.log("CURRENT USER:", currentUser.id);
      console.log("SHIP MEMBERSHIPS:", memberships);
      console.log("SHIP IDS:", shipIds);
      console.log("================================");

      let shipRows = [];

      if (shipIds.length) {
        const {
          data: shipsData,
          error: shipsError,
        } = await supabase
          .from("ships")
          .select("id, ship_name, imo_number, call_sign")
          .in("id", shipIds);

        if (shipsError) throw shipsError;

        shipRows = (shipsData || []).map((ship) => ({
          id: String(ship.id),
          name: ship.ship_name || "",
          imoNumber: ship.imo_number || "",
          callSign: ship.call_sign || "",
        }));
      }

      console.log("SHIP ROWS:", shipRows);
      setShips(shipRows);

      // ============================================
      // NO SHIP ASSIGNED
      // ============================================
      if (!shipIds.length) {
        console.log("NO SHIPS ASSIGNED TO THIS USER");
        setTanks([]);
        setLogs([]);
        setSelectedShipId("");
        return;
      }

      // ============================================
      // LOAD TANKS FOR ASSIGNED SHIPS
      // ============================================
      const {
        data: tankRows,
        error: tankError,
      } = await supabase
        .from("tanks")
        .select("id, ship_id, name, height, unit, created_at")
        .in("ship_id", shipIds);

      if (tankError) throw tankError;

      setTanks(
        (tankRows || []).map((tank, index) => ({
          id: String(tank.id),
          shipId: String(tank.ship_id),
          name: tank.name,
          height: Number(tank.height),
          unit: tank.unit || "m",
          order: index,
        }))
      );

      // ============================================
      // LOAD SOUNDING LOGS
      // ============================================
      const {
        data: logRows,
        error: logError,
      } = await supabase
        .from("soundings")
        .select(
          "id, ship_id, tank_id, user_id, date, time, depth, unit, remarks, created_at, updated_at"
        )
        .in("ship_id", shipIds)
        .order("date", { ascending: false })
        .order("time", { ascending: false });

      if (logError) throw logError;

      // ============================================
      // LOAD NAMES OF USERS WHO RECORDED LOGS
      // ============================================
      const userIds = [
        ...new Set(
          (logRows || [])
            .map((row) => row.user_id)
            .filter(Boolean)
        ),
      ];

      const names = {};

      if (userIds.length) {
        const {
          data: profileRows,
          error: namesError,
        } = await supabase
          .from("profiles")
          .select("id, full_name, rank")
          .in("id", userIds);

        if (namesError) throw namesError;

        (profileRows || []).forEach((item) => {
          names[item.id] = item.full_name || "";
        });
      }

      setLogs(
        (logRows || []).map((log) => ({
          id: String(log.id),
          shipId: String(log.ship_id),
          tankId: String(log.tank_id),
          date: log.date,
          time: String(log.time || "").slice(0, 5),
          depth: Number(log.depth),
          unit: log.unit || "m",
          recordedBy:
            names[log.user_id] ||
            (log.user_id === currentUser.id
              ? profileRow?.full_name || ""
              : ""),
          userId: log.user_id,
          remarks: log.remarks || "",
          createdAt: log.created_at,
          updatedAt: log.updated_at,
        }))
      );

      // ============================================
      // RESTORE PREVIOUSLY SELECTED SHIP
      // ============================================
      const saved = localStorage.getItem(
        STORAGE_KEYS.selectedShip
      );

      const savedId = saved ? JSON.parse(saved) : "";

      if (!shipRows.length) {
        console.log("SHIP MEMBERSHIPS EXIST BUT NO SHIP ROWS WERE READABLE");
        setTanks([]);
        setLogs([]);
        setSelectedShipId("");
        return;
      }

      const savedShipExists = shipRows.some(
        (ship) => ship.id === String(savedId)
      );

      setSelectedShipId(
        savedShipExists
          ? String(savedId)
          : String(shipRows[0].id)
      );
    } catch (error) {
      console.error("LOAD ONLINE DATA ERROR:", error);
      setLoginError(
        error?.message ||
          "Unable to load your online data."
      );
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    if (user) loadOnlineData(user);
  }, [user]);

  useEffect(() => {
    if (selectedShipId) localStorage.setItem(STORAGE_KEYS.selectedShip, JSON.stringify(selectedShipId));
  }, [selectedShipId]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify(settings)
    );
  }, [settings]);

  useEffect(() => {
    if (!statusMessage) return;

    const timer = setTimeout(() => {
      setStatusMessage("");
    }, 3000);

    return () => clearTimeout(timer);
  }, [statusMessage]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    if (error) setLoginError(error.message);
    setLoggingIn(false);
  }

  async function handleSignUp(event) {
    event.preventDefault();
    setSignupError("");
    setSignupNotice("");
    const name = signupName.trim();
    if (!name) { setSignupError("Please enter your name."); return; }
    if (signupPassword.length < 6) { setSignupError("Password must be at least 6 characters."); return; }

    setSigningUp(true);
    const { data, error } = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
      options: {
        data: { full_name: name },
      },
    });
    setSigningUp(false);

    if (error) { setSignupError(error.message); return; }

    if (!data.session) {
      setSignupNotice("Account created. Check your email to confirm before logging in.");
      setAuthMode("login");
      setLoginEmail(signupEmail.trim());
    }

    setSignupName("");
    setSignupEmail("");
    setSignupPassword("");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const selectedShip = ships.find((ship) => ship.id === selectedShipId) || ships[0];

  const currentShipId = selectedShip?.id || "ship-1";

  const currentTanks = useMemo(() => {
    return tanks.filter((tank) => (tank.shipId || "ship-1") === currentShipId);
  }, [tanks, currentShipId]);

  const currentLogs = useMemo(() => {
    return logs.filter((log) => (log.shipId || "ship-1") === currentShipId);
  }, [logs, currentShipId]);

  const orderedTanks = useMemo(() => {
    return [...currentTanks].sort((a, b) => a.order - b.order);
  }, [currentTanks]);

  const sortedLogs = useMemo(() => {
    return [...currentLogs].sort((a, b) => {
      const first = new Date(a.date + "T" + a.time);
      const second = new Date(b.date + "T" + b.time);

      return second - first;
    });
  }, [currentLogs]);

  const filteredLogs = useMemo(() => {
    return sortedLogs.filter((log) => {
      if (historyTank !== "all" && log.tankId !== historyTank) {
        return false;
      }

      if (historyFrom && log.date < historyFrom) {
        return false;
      }

      if (historyTo && log.date > historyTo) {
        return false;
      }

      return true;
    });
  }, [sortedLogs, historyTank, historyFrom, historyTo]);

  const selectedTank = tanks.find(
    (tank) => tank.id === soundingForm.tankId
  );

  const calculatedFill = useMemo(() => {
    if (!selectedTank || !soundingForm.depth) return null;

    let depthMeters = Number(soundingForm.depth);

    if (soundingForm.unit === "cm") {
      depthMeters = depthMeters / 100;
    }

    if (!Number.isFinite(depthMeters) || depthMeters < 0) {
      return null;
    }

    return Math.min(
      100,
      Math.max(0, (depthMeters / Number(selectedTank.height)) * 100)
    );
  }, [selectedTank, soundingForm.depth, soundingForm.unit]);

  const [profileNameForm, setProfileNameForm] = useState("");
  const [savingProfileName, setSavingProfileName] = useState(false);

  useEffect(() => {
    setProfileNameForm(profile?.full_name || "");
  }, [profile]);

  async function saveProfileName() {
    const name = profileNameForm.trim();
    if (!name) { alert("Please enter your name."); return; }
    setSavingProfileName(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("id", user.id);
    setSavingProfileName(false);
    if (error) { alert(error.message); return; }
    await loadOnlineData(user);
    showStatus("Your name was updated.");
  }

  function showStatus(message) {
    setStatusMessage(message);
  }

  function resetShipForm() {
    setShipForm({ name: "", imoNumber: "", callSign: "", password: "" });
    setEditingShipId(null);
  }

  async function saveShip(e) {
    e.preventDefault();
    if (editingShipId && profile?.role !== "admin") {
      alert("Only an administrator can edit an existing ship.");
      return;
    }
    const name = shipForm.name.trim();
    if (!name) { alert("Please enter a ship name."); return; }

    if (editingShipId) {
      const { error } = await supabase.from("ships").update({
        ship_name: name,
        imo_number: shipForm.imoNumber.trim(),
        call_sign: shipForm.callSign.trim(),
      }).eq("id", Number(editingShipId));
      if (error) { alert(error.message); return; }
      await loadOnlineData(user);
      showStatus("Ship updated.");
    } else {
      if (!shipForm.password || shipForm.password.length < 4) {
        alert("Please set a ship password of at least 4 characters.");
        return;
      }
      const { data: shipId, error } = await supabase.rpc("create_ship_with_password", {
        p_ship_name: name,
        p_imo_number: shipForm.imoNumber.trim(),
        p_call_sign: shipForm.callSign.trim(),
        p_password: shipForm.password,
      });
      if (error) { alert(error.message); return; }
      await loadOnlineData(user);
      setSelectedShipId(String(shipId));
      showStatus("Ship created.");
    }
    resetShipForm();
  }

  async function joinShipByPassword(e) {
    e.preventDefault();
    setJoinShipError("");
    const name = joinShipName.trim();
    if (!name) { setJoinShipError("Please enter the ship's name."); return; }
    if (!joinShipPassword) { setJoinShipError("Please enter the ship's password."); return; }

    setJoiningShip(true);
    const { data, error } = await supabase.rpc("join_ship_with_password", {
      p_ship_name: name,
      p_password: joinShipPassword,
    });
    setJoiningShip(false);

    if (error) { setJoinShipError(error.message); return; }
    if (!data) { setJoinShipError("Ship name or password is incorrect."); return; }

    setJoinShipName("");
    setJoinShipPassword("");
    await loadOnlineData(user);
    setSelectedShipId(String(data));
    showStatus("You entered the ship.");
  }

  function editShip(ship) {
    setEditingShipId(ship.id);
    setShipForm({ name: ship.name, imoNumber: ship.imoNumber || "", callSign: ship.callSign || "" });
  }

  function requestDeleteShip(ship) {
    if (ships.length === 1) { alert("At least one ship must remain."); return; }
    setConfirmDialog({
      title: "Delete Ship?",
      message: `Delete "${ship.name}"? All tanks and sounding records belonging to this ship will also be deleted.`,
      confirmText: "Delete Ship",
      danger: true,
      onConfirm: () => deleteShip(ship.id),
    });
  }

  async function deleteShip(shipId) {
    if (profile?.role !== "admin") { alert("Only an administrator can delete ships."); return; }
    const { error } = await supabase.from("ships").delete().eq("id", Number(shipId));
    if (error) { alert(error.message); return; }
    await loadOnlineData(user);
    setConfirmDialog(null);
    showStatus("Ship and its records were deleted.");
  }

  function resetTankForm() {
    setTankForm({
      name: "",
      height: "",
      unit: "m",
    });

    setEditingTankId(null);
  }

  async function saveTank(e) {
    e.preventDefault();
    const name = tankForm.name.trim();
    const height = Number(tankForm.height);
    if (!name) { alert("Please enter a tank name."); return; }
    if (!Number.isFinite(height) || height <= 0) { alert("Please enter a valid tank height."); return; }

    if (editingTankId) {
      const { error } = await supabase.from("tanks").update({ name, height, unit: tankForm.unit }).eq("id", Number(editingTankId));
      if (error) { alert(error.message); return; }
      await loadOnlineData(user);
      showStatus("Tank updated.");
    } else {
      const nextOrder = orderedTanks.length ? Math.max(...orderedTanks.map((tank) => tank.order)) + 1 : 0;
      const { error } = await supabase.from("tanks").insert({ ship_id: Number(currentShipId), name, height, unit: tankForm.unit });
      if (error) { alert(error.message); return; }
      await loadOnlineData(user);
      showStatus("Tank added.");
    }
    resetTankForm();
  }

  function editTank(tank) {
    setEditingTankId(tank.id);

    setTankForm({
      name: tank.name,
      height: tank.height,
      unit: tank.unit,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestDeleteTank(tank) {
    setConfirmDialog({
      title: "Delete Tank?",
      message: 'Delete "' + tank.name + '"? All sounding history for this tank will also be permanently deleted.',
      confirmText: "Delete Tank",
      danger: true,
      onConfirm: () => deleteTank(tank.id),
    });
  }

  async function deleteTank(tankId) {
    const { error } = await supabase.from("tanks").delete().eq("id", Number(tankId));
    if (error) { alert(error.message); return; }
    await loadOnlineData(user);
    if (soundingForm.tankId === tankId) setSoundingForm((current) => ({ ...current, tankId: "" }));
    setConfirmDialog(null);
    showStatus("Tank and its sounding history were deleted.");
  }

  function moveTank() {
    showStatus("Tank ordering is managed by the database configuration.");
  }

  function resetSoundingForm() {
    const now = getNowDateTime();

    setSoundingForm({
      tankId: orderedTanks[0]?.id || "",
      date: now.date,
      time: now.time,
      depth: "",
      unit: settings.defaultUnit,
      recordedBy: settings.crewName || "",
      remarks: "",
    });

    setEditingLogId(null);
  }

  async function saveSounding(e) {
    e.preventDefault();
    if (!user) { alert("Please log in first."); return; }
    if (!soundingForm.tankId) { alert("Please select a tank."); return; }
    const depth = Number(soundingForm.depth);
    if (!Number.isFinite(depth) || depth < 0) { alert("Please enter a valid water depth."); return; }
    if (!soundingForm.date || !soundingForm.time) { alert("Please enter the date and time."); return; }
    const tank = tanks.find((item) => item.id === soundingForm.tankId);
    if (!tank) { alert("Selected tank could not be found."); return; }
    let depthMeters = depth;
    if (soundingForm.unit === "cm") depthMeters = depth / 100;
    if (depthMeters > Number(tank.height)) {
      const proceed = window.confirm(`The entered depth (${depth} ${soundingForm.unit}) exceeds the tank height (${tank.height} ${tank.unit}).\n\nDo you want to save it anyway?`);
      if (!proceed) return;
    }

    const payload = {
      ship_id: Number(currentShipId),
      tank_id: Number(soundingForm.tankId),
      user_id: user.id,
      date: soundingForm.date,
      time: soundingForm.time,
      depth,
      unit: soundingForm.unit,
      remarks: soundingForm.remarks.trim(),
    };

    let error;
    if (editingLogId) {
      ({ error } = await supabase.from("soundings").update(payload).eq("id", Number(editingLogId)).eq("user_id", user.id));
    } else {
      ({ error } = await supabase.from("soundings").insert(payload));
    }
    if (error) { alert(error.message); return; }
    await loadOnlineData(user);
    showStatus(editingLogId ? "Sounding entry updated." : "Sounding entry saved.");
    resetSoundingForm();
  }

  function editLog(log) {
    setEditingLogId(log.id);

    setSoundingForm({
      tankId: log.tankId,
      date: log.date,
      time: log.time,
      depth: log.depth,
      unit: log.unit,
      recordedBy: log.recordedBy || "",
      remarks: log.remarks || "",
    });

    setPage("new");
  }

  function requestDeleteLog(log) {
    const tank = tanks.find(
      (item) => item.id === log.tankId
    );

    setConfirmDialog({
      title: "Delete Sounding?",
      message: `Delete the ${log.depth} ${log.unit} sounding for "${tank?.name || "Unknown Tank"}" recorded on ${log.date} at ${log.time}?`,
      confirmText: "Delete Entry",
      danger: true,
      onConfirm: () => deleteLog(log.id),
    });
  }

  async function deleteLog(logId) {
    const { error } = await supabase.from("soundings").delete().eq("id", Number(logId)).eq("user_id", user.id);
    if (error) { alert(error.message); return; }
    await loadOnlineData(user);
    setConfirmDialog(null);
    showStatus("Sounding entry deleted.");
  }

  function exportCSV() {
    if (logs.length === 0) {
      alert("There are no log entries to export.");
      return;
    }

    const header = [
      "Ship",
      "Date",
      "Time",
      "Tank",
      "Depth",
      "Unit",
      "Fill %",
      "Recorded By",
      "Notes",
    ];

    const rows = sortedLogs.map((log) => {
      const tank = tanks.find(
        (item) => item.id === log.tankId
      );

      let depthMeters = Number(log.depth);

      if (log.unit === "cm") {
        depthMeters = depthMeters / 100;
      }

      const fill =
        tank && tank.height
          ? (depthMeters / Number(tank.height)) * 100
          : "";

      return [
        selectedShip?.name || "Unknown Ship",
        log.date,
        log.time,
        tank?.name || "Deleted Tank",
        log.depth,
        log.unit,
        fill === "" ? "" : fill.toFixed(1),
        log.recordedBy || "",
        log.remarks || "",
      ];
    });

    const csvEscape = (value) => {
      const text = String(value ?? "");

      if (
        text.includes(",") ||
        text.includes('"') ||
        text.includes("\n")
      ) {
        return `"${text.replace(/"/g, '""')}"`;
      }

      return text;
    };

    const csv = [
      header,
      ...rows,
    ]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    downloadFile(
      csv,
      `ballast-logbook-${getFileDate()}.csv`,
      "text/csv;charset=utf-8;"
    );

    showStatus("CSV exported.");
  }

  function exportBackup() {
    const backup = {
      application: "Ballast Tank Depth Logbook",
      version: 1,
      exportedAt: new Date().toISOString(),
      ships,
      selectedShipId,
      tanks,
      logs,
      settings,
    };

    downloadFile(
      JSON.stringify(backup, null, 2),
      `ballast-logbook-backup-${getFileDate()}.json`,
      "application/json"
    );

    showStatus("Backup created.");
  }

  function importBackup(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);

        if (
          !Array.isArray(backup.tanks) ||
          !Array.isArray(backup.logs)
        ) {
          throw new Error("Invalid backup file.");
        }

        setConfirmDialog({
          title: "Restore Backup?",
          message:
            "Restoring this backup will replace the current tanks and log entries stored on this device.",
          confirmText: "Restore",
          danger: true,
          onConfirm: () => {
            if (Array.isArray(backup.ships)) setShips(backup.ships);
            setTanks(backup.tanks);
            setLogs(backup.logs);
            if (backup.selectedShipId) setSelectedShipId(backup.selectedShipId);

            if (backup.settings) {
              setSettings(backup.settings);
            }

            setConfirmDialog(null);
            showStatus("Backup restored successfully.");
          },
        });
      } catch {
        alert("The selected file is not a valid Ballast Logbook backup.");
      }

      event.target.value = "";
    };

    reader.readAsText(file);
  }

  function printPDF() {
    window.print();
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  function getFileDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function getTankName(tankId) {
    return (
      tanks.find((tank) => tank.id === tankId)?.name ||
      "Deleted Tank"
    );
  }

  function getFillPercent(log) {
    const tank = tanks.find(
      (item) => item.id === log.tankId
    );

    if (!tank) return null;

    let depthMeters = Number(log.depth);

    if (log.unit === "cm") {
      depthMeters /= 100;
    }

    if (!Number.isFinite(depthMeters)) return null;

    return (depthMeters / Number(tank.height)) * 100;
  }

  function renderHome() {
    const latestLogs = sortedLogs.slice(0, 8);

    return (
      <div className="page">
        <div className="hero">
          <div>
            <div className="eyebrow">SHIPBOARD LOGBOOK</div>
            <h1>Ballast Tank Depth</h1>
            <p>
              Record and monitor ballast tank sounding readings for the selected ship.
            </p>
          </div>

          <div className="heroIcon">⚓</div>
        </div>

        <div className="notice shipNotice">
          <strong>Selected Ship: {selectedShip?.name || "None"}</strong>
          <span>All tanks and sounding records shown below belong only to this ship.</span>
        </div>

        <div className="dashboardGrid">
          <button
            className="dashboardCard primary"
            onClick={() => {
              resetSoundingForm();
              setPage("new");
            }}
          >
            <span className="cardIcon">＋</span>
            <strong>New Sounding</strong>
            <small>Record a tank depth reading</small>
          </button>

          <button
            className="dashboardCard"
            onClick={() => setPage("history")}
          >
            <span className="cardIcon">☷</span>
            <strong>Log History</strong>
            <small>{logs.length} recorded entries</small>
          </button>

          <button
            className="dashboardCard"
            onClick={() => setPage("tanks")}
          >
            <span className="cardIcon">▣</span>
            <strong>Tank Setup</strong>
            <small>{tanks.length} ballast tanks</small>
          </button>

          <button
            className="dashboardCard"
            onClick={() => setPage("trends")}
          >
            <span className="cardIcon">↗</span>
            <strong>Trends</strong>
            <small>Depth over time</small>
          </button>
        </div>

        <section className="section">
          <div className="sectionHeader">
            <div>
              <h2>Tank Status</h2>
              <p>Latest recorded sounding for each tank</p>
            </div>
          </div>

          {orderedTanks.length === 0 ? (
            <EmptyState
              title="No tanks configured"
              text="Add your ballast tanks in Tank Setup."
              button="Tank Setup"
              onClick={() => setPage("tanks")}
            />
          ) : (
            <div className="tankStatusGrid">
              {orderedTanks.map((tank) => {
                const tankLogs = sortedLogs.filter(
                  (log) => log.tankId === tank.id
                );

                const latest = tankLogs[0];
                const fill = latest
                  ? getFillPercent(latest)
                  : null;

                return (
                  <div className="statusCard" key={tank.id}>
                    <div className="statusTop">
                      <strong>{tank.name}</strong>
                      <span>
                        {tank.height} {tank.unit}
                      </span>
                    </div>

                    {latest ? (
                      <>
                        <div className="bigDepth">
                          {latest.depth}{" "}
                          <span>{latest.unit}</span>
                        </div>

                        <div className="progressTrack">
                          <div
                            className="progressBar"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, fill || 0)
                              )}%`,
                            }}
                          />
                        </div>

                        <div className="statusBottom">
                          <span>
                            {fill !== null
                              ? `${fill.toFixed(1)}%`
                              : "--"}
                          </span>

                          <span>
                            {latest.date} {latest.time}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="noReading">
                        No sounding recorded
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="section">
          <div className="sectionHeader">
            <div>
              <h2>Recent Soundings</h2>
              <p>Latest entries</p>
            </div>

            <button
              className="secondaryButton"
              onClick={() => setPage("history")}
            >
              View All
            </button>
          </div>

          <LogTable
            logs={latestLogs}
            getTankName={getTankName}
            getFillPercent={getFillPercent}
            onEdit={editLog}
            onDelete={requestDeleteLog}
          />
        </section>
      </div>
    );
  }

  function renderNewSounding() {
    return (
      <div className="page narrow">
        <div className="pageTitle">
          <div>
            <div className="eyebrow">
              {editingLogId ? "EDIT ENTRY" : "NEW ENTRY"}
            </div>

            <h1>
              {editingLogId
                ? "Edit Sounding"
                : "New Sounding"}
            </h1>

            <p>
              Record the current ballast tank water depth for <strong>{selectedShip?.name || "the selected ship"}</strong>.
            </p>
          </div>
        </div>

        <form className="formCard" onSubmit={saveSounding}>
          <label>
            Tank
            <select
              value={soundingForm.tankId}
              onChange={(e) =>
                setSoundingForm((current) => ({
                  ...current,
                  tankId: e.target.value,
                }))
              }
            >
              <option value="">Select tank</option>

              {orderedTanks.map((tank) => (
                <option key={tank.id} value={tank.id}>
                  {tank.name}
                </option>
              ))}
            </select>
          </label>

          {selectedTank && (
            <div className="tankInfo">
              <div>
                <span>Tank height</span>
                <strong>
                  {selectedTank.height} {selectedTank.unit}
                </strong>
              </div>

              <div>
                <span>Expected maximum sounding</span>
                <strong>
                  {selectedTank.height} {selectedTank.unit}
                </strong>
              </div>
            </div>
          )}

          <div className="twoColumns">
            <label>
              Date
              <input
                type="date"
                value={soundingForm.date}
                onChange={(e) =>
                  setSoundingForm((current) => ({
                    ...current,
                    date: e.target.value,
                  }))
                }
              />
            </label>

            <label>
              Time
              <input
                type="time"
                value={soundingForm.time}
                onChange={(e) =>
                  setSoundingForm((current) => ({
                    ...current,
                    time: e.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="twoColumns">
            <label>
              Water Depth
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="e.g. 2.35"
                value={soundingForm.depth}
                onChange={(e) =>
                  setSoundingForm((current) => ({
                    ...current,
                    depth: e.target.value,
                  }))
                }
              />
            </label>

            <label>
              Unit
              <select
                value={soundingForm.unit}
                onChange={(e) =>
                  setSoundingForm((current) => ({
                    ...current,
                    unit: e.target.value,
                  }))
                }
              >
                <option value="m">Meters (m)</option>
                <option value="cm">Centimeters (cm)</option>
              </select>
            </label>
          </div>

          {calculatedFill !== null && selectedTank && (
            <div className="fillPanel">
              <div>
                <span>Calculated Fill Level</span>
                <strong>
                  {calculatedFill.toFixed(1)}%
                </strong>
              </div>

              <div className="largeProgressTrack">
                <div
                  className="progressBar"
                  style={{
                    width: `${calculatedFill}%`,
                  }}
                />
              </div>

              <small>
                Fill level = water depth ÷ tank height × 100
              </small>
            </div>
          )}

          <label>
            Recorded By
            <input
              type="text"
              placeholder="Name / Rank"
              value={soundingForm.recordedBy}
              onChange={(e) =>
                setSoundingForm((current) => ({
                  ...current,
                  recordedBy: e.target.value,
                }))
              }
            />
          </label>

          <label>
            Remarks / Notes
            <textarea
              rows="4"
              placeholder="Optional remarks..."
              value={soundingForm.remarks}
              onChange={(e) =>
                setSoundingForm((current) => ({
                  ...current,
                  remarks: e.target.value,
                }))
              }
            />
          </label>

          {editingLogId && (
            <div className="notice">
              <strong>Data integrity</strong>
              <span>
                The original creation timestamp of this entry
                will be preserved.
              </span>
            </div>
          )}

          <div className="formActions">
            <button
              type="button"
              className="secondaryButton largeButton"
              onClick={() => {
                resetSoundingForm();
                setPage("home");
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primaryButton largeButton"
            >
              {editingLogId
                ? "Save Changes"
                : "Save Sounding"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  function renderShips() {
    return (
      <div className="page">
        <div className="pageTitle">
          <div>
            <div className="eyebrow">VESSEL CONFIGURATION</div>
            <h1>Ship Setup</h1>
            <p>Each ship has its own tanks, sounding records, history and trends.</p>
          </div>
        </div>

        <div className="setupGrid">
          <form className="formCard" onSubmit={joinShipByPassword}>
            <h2>Enter Another Ship</h2>
            <p style={{ marginTop: "-6px" }}>Type the exact ship name and its password to gain access.</p>
            <label>Ship Name<input type="text" placeholder="e.g. MV Ocean Star" value={joinShipName} onChange={(e) => setJoinShipName(e.target.value)}/></label>
            <label>Ship Password<input type="password" value={joinShipPassword} onChange={(e) => setJoinShipPassword(e.target.value)}/></label>
            {joinShipError && <div className="authError">{joinShipError}</div>}
            <div className="formActions">
              <button type="submit" className="primaryButton largeButton" disabled={joiningShip}>{joiningShip ? "Entering..." : "Enter Ship"}</button>
            </div>
          </form>

          <form className="formCard" onSubmit={saveShip}>
            <h2>{editingShipId ? "Edit Ship" : "Add Ship"}</h2>
            <label>Ship Name<input type="text" placeholder="e.g. MV Ocean Star" value={shipForm.name} onChange={(e) => setShipForm((c) => ({...c, name:e.target.value}))}/></label>
            <label>IMO Number<input type="text" placeholder="Optional" value={shipForm.imoNumber} onChange={(e) => setShipForm((c) => ({...c, imoNumber:e.target.value}))}/></label>
            <label>Call Sign<input type="text" placeholder="Optional" value={shipForm.callSign} onChange={(e) => setShipForm((c) => ({...c, callSign:e.target.value}))}/></label>
            {!editingShipId && (
              <label>Ship Password<input type="password" placeholder="Others will need this to join" value={shipForm.password} onChange={(e) => setShipForm((c) => ({...c, password:e.target.value}))} minLength={4}/></label>
            )}
            <div className="formActions">
              {editingShipId && <button type="button" className="secondaryButton largeButton" onClick={resetShipForm}>Cancel</button>}
              <button type="submit" className="primaryButton largeButton">{editingShipId ? "Update Ship" : "Add Ship"}</button>
            </div>
          </form>

          <div className="tankListCard">
            <div className="listHeader"><div><h2>Ships</h2><p>{ships.length} configured ship{ships.length !== 1 ? "s" : ""}</p></div></div>
            <div className="tankList">
              {ships.map((ship) => {
                const shipTankCount = tanks.filter((t) => (t.shipId || "ship-1") === ship.id).length;
                const shipLogCount = logs.filter((l) => (l.shipId || "ship-1") === ship.id).length;
                return (
                  <div className="tankRow" key={ship.id}>
                    <div className="tankNumber">🚢</div>
                    <div className="tankDetails"><strong>{ship.name}</strong><span>{ship.imoNumber ? `IMO ${ship.imoNumber}` : "No IMO entered"} · {shipTankCount} tanks · {shipLogCount} records</span></div>
                    <div className="tankControls">
                      <button className="iconButton" title="Select" onClick={() => {setSelectedShipId(ship.id); setPage("home");}}>✓</button>
                      <button className="iconButton" title="Edit" onClick={() => editShip(ship)}>✎</button>
                      <button className="iconButton danger" title="Delete" onClick={() => requestDeleteShip(ship)}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderTanks() {
    return (
      <div className="page">
        <div className="pageTitle">
          <div>
            <div className="eyebrow">CONFIGURATION</div>
            <h1>Tank Setup</h1>
            <p>
              Configure tanks for the selected ship: {selectedShip?.name || "Current Ship"}.
            </p>
          </div>
        </div>

        <div className="setupGrid">
          <form className="formCard" onSubmit={saveTank}>
            <h2>
              {editingTankId ? "Edit Tank" : "Add Tank"}
            </h2>

            <label>
              Tank Name / Number
              <input
                type="text"
                placeholder="e.g. No.1 Port"
                value={tankForm.name}
                onChange={(e) =>
                  setTankForm((current) => ({
                    ...current,
                    name: e.target.value,
                  }))
                }
              />
            </label>

            <label>
              Tank Height
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 5.00"
                value={tankForm.height}
                onChange={(e) =>
                  setTankForm((current) => ({
                    ...current,
                    height: e.target.value,
                  }))
                }
              />
            </label>

            <label>
              Height Unit
              <select
                value={tankForm.unit}
                onChange={(e) =>
                  setTankForm((current) => ({
                    ...current,
                    unit: e.target.value,
                  }))
                }
              >
                <option value="m">Meters (m)</option>
                <option value="cm">Centimeters (cm)</option>
              </select>
            </label>

            <div className="formActions">
              {editingTankId && (
                <button
                  type="button"
                  className="secondaryButton largeButton"
                  onClick={resetTankForm}
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                className="primaryButton largeButton"
              >
                {editingTankId ? "Update Tank" : "Add Tank"}
              </button>
            </div>
          </form>

          <div className="tankListCard">
            <div className="listHeader">
              <div>
                <h2>{selectedShip?.name || "Ship"} — Ballast Tanks</h2>
                <p>
                  {tanks.length} configured tank
                  {tanks.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {orderedTanks.length === 0 ? (
              <EmptyState
                title="No tanks"
                text="Add your first ballast tank."
              />
            ) : (
              <div className="tankList">
                {orderedTanks.map((tank, index) => (
                  <div className="tankRow" key={tank.id}>
                    <div className="tankNumber">
                      {index + 1}
                    </div>

                    <div className="tankDetails">
                      <strong>{tank.name}</strong>
                      <span>
                        Height: {tank.height} {tank.unit}
                      </span>
                    </div>

                    <div className="tankControls">
                      <button
                        className="iconButton"
                        title="Move up"
                        disabled={index === 0}
                        onClick={() =>
                          moveTank(tank.id, "up")
                        }
                      >
                        ↑
                      </button>

                      <button
                        className="iconButton"
                        title="Move down"
                        disabled={
                          index === orderedTanks.length - 1
                        }
                        onClick={() =>
                          moveTank(tank.id, "down")
                        }
                      >
                        ↓
                      </button>

                      <button
                        className="iconButton"
                        title="Edit"
                        onClick={() => editTank(tank)}
                      >
                        ✎
                      </button>

                      <button
                        className="iconButton danger"
                        title="Delete"
                        onClick={() =>
                          requestDeleteTank(tank)
                        }
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderHistory() {
    return (
      <div className="page">
        <div className="pageTitle">
          <div>
            <div className="eyebrow">RECORDS</div>
            <h1>Log History</h1>
            <p>
              Chronological sounding history for the selected ship.
            </p>
          </div>

          <div className="pageActions">
            <button
              className="secondaryButton"
              onClick={exportCSV}
            >
              Export CSV
            </button>

            <button
              className="secondaryButton"
              onClick={printPDF}
            >
              Print / PDF
            </button>
          </div>
        </div>

        <div className="filterCard">
          <label>
            Tank
            <select
              value={historyTank}
              onChange={(e) =>
                setHistoryTank(e.target.value)
              }
            >
              <option value="all">All Tanks</option>

              {orderedTanks.map((tank) => (
                <option key={tank.id} value={tank.id}>
                  {tank.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            From
            <input
              type="date"
              value={historyFrom}
              onChange={(e) =>
                setHistoryFrom(e.target.value)
              }
            />
          </label>

          <label>
            To
            <input
              type="date"
              value={historyTo}
              onChange={(e) =>
                setHistoryTo(e.target.value)
              }
            />
          </label>

          <button
            className="secondaryButton"
            onClick={() => {
              setHistoryTank("all");
              setHistoryFrom("");
              setHistoryTo("");
            }}
          >
            Clear Filters
          </button>
        </div>

        <div className="resultsCount">
          Showing <strong>{filteredLogs.length}</strong>{" "}
          entries
        </div>

        <LogTable
          logs={filteredLogs}
          getTankName={getTankName}
          getFillPercent={getFillPercent}
          detailed
          showActions={false}
        />
      </div>
    );
  }

  function renderTrends() {
    const tank =
      tanks.find(
        (item) => item.id === selectedTrendTank
      ) || orderedTanks[0];

    const trendLogs = tank
      ? [...logs]
          .filter((log) => log.tankId === tank.id)
          .sort(
            (a, b) =>
              new Date(`${a.date}T${a.time}`) -
              new Date(`${b.date}T${b.time}`)
          )
      : [];

    const values = trendLogs.map((log) => {
      let depth = Number(log.depth);

      if (log.unit === "cm") {
        depth /= 100;
      }

      return {
        log,
        depth,
      };
    });

    const maxDepth = tank
      ? Number(tank.height)
      : 1;

    return (
      <div className="page">
        <div className="pageTitle">
          <div>
            <div className="eyebrow">ANALYSIS</div>
            <h1>Depth Trends</h1>
            <p>
              Simple water-depth trend for the selected
              ballast tank.
            </p>
          </div>
        </div>

        <div className="trendCard">
          <label>
            Select Tank
            <select
              value={tank?.id || ""}
              onChange={(e) =>
                setSelectedTrendTank(e.target.value)
              }
            >
              {orderedTanks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          {values.length === 0 ? (
            <EmptyState
              title="No trend data"
              text="Record at least one sounding for this tank."
            />
          ) : (
            <>
              <div className="trendChart">
                {values.map((item, index) => {
                  const percentage = Math.min(
                    100,
                    Math.max(
                      0,
                      (item.depth / maxDepth) * 100
                    )
                  );

                  return (
                    <div
                      className="chartColumn"
                      key={item.log.id}
                    >
                      <div className="chartValue">
                        {item.depth.toFixed(2)} m
                      </div>

                      <div className="chartBarArea">
                        <div
                          className="chartBar"
                          style={{
                            height: `${Math.max(
                              3,
                              percentage
                            )}%`,
                          }}
                        />
                      </div>

                      <div className="chartLabel">
                        {item.log.date}
                        <br />
                        {item.log.time}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="trendLegend">
                <strong>{tank?.name}</strong>

                <span>
                  Tank height: {tank?.height} {tank?.unit}
                </span>

                <span>
                  {values.length} reading
                  {values.length !== 1 ? "s" : ""}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderBackup() {
    return (
      <div className="page narrow">
        <div className="pageTitle">
          <div>
            <div className="eyebrow">DATA MANAGEMENT</div>
            <h1>Export & Backup</h1>
            <p>
              Keep a backup of your tank configuration and
              sounding records.
            </p>
          </div>
        </div>

        <div className="backupGrid">
          <div className="backupCard">
            <span className="backupIcon">⬇</span>
            <h2>CSV Export</h2>
            <p>
              Export sounding records into a spreadsheet
              compatible CSV file.
            </p>

            <button
              className="primaryButton"
              onClick={exportCSV}
            >
              Export CSV
            </button>
          </div>

          <div className="backupCard">
            <span className="backupIcon">▣</span>
            <h2>Full Backup</h2>
            <p>
              Save tanks, sounding records and application
              settings as a JSON backup.
            </p>

            <button
              className="primaryButton"
              onClick={exportBackup}
            >
              Create Backup
            </button>
          </div>

          <div className="backupCard">
            <span className="backupIcon">↥</span>
            <h2>Restore Backup</h2>
            <p>
              Restore a previously exported Ballast Logbook
              backup.
            </p>

            <label className="fileButton">
              Select Backup
              <input
                type="file"
                accept=".json,application/json"
                onChange={importBackup}
              />
            </label>
          </div>

          <div className="backupCard">
            <span className="backupIcon">▤</span>
            <h2>PDF / Print</h2>
            <p>
              Use the device or browser print dialog to save
              the logbook as a PDF.
            </p>

            <button
              className="primaryButton"
              onClick={printPDF}
            >
              Print / PDF
            </button>
          </div>
        </div>

        <div className="notice">
          <strong>Offline storage</strong>
          <span>
            Your current tank configuration and log records
            are stored locally on this device using browser
            local storage. Internet access is not required
            for normal operation.
          </span>
        </div>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="page narrow">
        <div className="pageTitle">
          <div>
            <div className="eyebrow">PREFERENCES</div>
            <h1>Settings</h1>
            <p>Configure the logbook for your watch routine.</p>
          </div>
        </div>

        <div className="formCard">
          <label>
            Your Name
            <input
              type="text"
              placeholder="Name shown on log entries you record"
              value={profileNameForm}
              onChange={(e) => setProfileNameForm(e.target.value)}
            />
          </label>
          <div className="formActions">
            <button
              type="button"
              className="primaryButton largeButton"
              disabled={savingProfileName}
              onClick={saveProfileName}
            >
              {savingProfileName ? "Saving..." : "Save Name"}
            </button>
          </div>
          <div className="notice">
            <strong>Why this matters</strong>
            <span>
              This is the name crew see next to your entries in
              Log History, so everyone knows who made each change.
            </span>
          </div>
        </div>

        <div className="formCard">
          <label className="toggleRow">
            <div>
              <strong>Night / Dark Mode</strong>
              <span>
                Use a true-black, high-contrast interface for
                night watches.
              </span>
            </div>

            <input
              type="checkbox"
              checked={settings.darkMode}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  darkMode: e.target.checked,
                }))
              }
            />
          </label>

          <label>
            Default Sounding Unit
            <select
              value={settings.defaultUnit}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  defaultUnit: e.target.value,
                }))
              }
            >
              <option value="m">Meters (m)</option>
              <option value="cm">Centimeters (cm)</option>
            </select>
          </label>

          <label>
            Default Recorded By
            <input
              type="text"
              placeholder="Name / Rank"
              value={settings.crewName}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  crewName: e.target.value,
                }))
              }
            />
          </label>

          <div className="notice">
            <strong>Night operation</strong>
            <span>
              Dark mode uses a black background and high
              contrast controls to reduce unnecessary screen
              light during night watch.
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return <div className="authScreen"><style>{CSS}</style><div className="authCard"><div className="heroIcon">⚓</div><h1>Ballast Logbook</h1><p>Connecting to secure online database...</p></div></div>;
  }

  if (!user) {
    if (authMode === "signup") {
      return (
        <div className="authScreen">
          <style>{CSS}</style>
          <form className="authCard" onSubmit={handleSignUp}>
            <div className="heroIcon">⚓</div>
            <div className="eyebrow">SHIPBOARD LOGBOOK</div>
            <h1>Create Account</h1>
            <p>Sign up, then join or create your ship.</p>
            <label>Name<input type="text" value={signupName} onChange={(e) => setSignupName(e.target.value)} required autoComplete="name" /></label>
            <label>Email<input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required autoComplete="email" /></label>
            <label>Password<input type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required autoComplete="new-password" minLength={6} /></label>
            {signupError && <div className="authError">{signupError}</div>}
            <button className="primaryButton" type="submit" disabled={signingUp}>{signingUp ? "Creating account..." : "Sign Up"}</button>
            <button type="button" className="secondaryButton" style={{ marginTop: "10px", width: "100%" }} onClick={() => { setAuthMode("login"); setSignupError(""); }}>
              Already have an account? Log in
            </button>
          </form>
        </div>
      );
    }

    return (
      <div className="authScreen">
        <style>{CSS}</style>
        <form className="authCard" onSubmit={handleLogin}>
          <div className="heroIcon">⚓</div>
          <div className="eyebrow">SHIPBOARD LOGBOOK</div>
          <h1>Ballast Logbook</h1>
          <p>Sign in to access your ship's sounding records.</p>
          {signupNotice && <div className="authError" style={{ background: "rgba(60,160,120,.15)", color: "#7fe0b8" }}>{signupNotice}</div>}
          <label>Email<input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required autoComplete="current-password" /></label>
          {loginError && <div className="authError">{loginError}</div>}
          <button className="primaryButton" type="submit" disabled={loggingIn}>{loggingIn ? "Signing in..." : "Login"}</button>
          <button type="button" className="secondaryButton" style={{ marginTop: "10px", width: "100%" }} onClick={() => { setAuthMode("signup"); setLoginError(""); }}>
            New here? Create an account
          </button>
        </form>
      </div>
    );
  }

  if (dataLoading) {
    return <div className="authScreen"><style>{CSS}</style><div className="authCard"><div className="heroIcon">⚓</div><h1>Loading your ships...</h1><p>Please wait while your online records are loaded.</p></div></div>;
  }

  if (!ships.length) {
    return (
      <div className="authScreen">
        <style>{CSS}</style>
        <div className="authCard" style={{ width: "min(560px, 100%)" }}>
          <div className="heroIcon">🚢</div>
          <div className="eyebrow">NO SHIP YET</div>
          <h1>Welcome, {profile?.full_name || user.email}</h1>
          <p>You're not on a ship yet. Enter one below, or create your own.</p>

          <form onSubmit={joinShipByPassword} style={{ margin: "18px 0" }}>
            <label>
              Ship Name
              <input
                type="text"
                placeholder="e.g. MV Ocean Star"
                value={joinShipName}
                onChange={(e) => setJoinShipName(e.target.value)}
              />
            </label>
            <label>
              Ship Password
              <input
                type="password"
                value={joinShipPassword}
                onChange={(e) => setJoinShipPassword(e.target.value)}
              />
            </label>
            {joinShipError && <div className="authError">{joinShipError}</div>}
            <button className="primaryButton largeButton" type="submit" disabled={joiningShip} style={{ marginTop: "10px" }}>
              {joiningShip ? "Entering..." : "Enter Ship"}
            </button>
          </form>

          <div style={{ opacity: 0.6, fontSize: "12px", margin: "18px 0", textAlign: "center" }}>— or —</div>

          <form onSubmit={saveShip} style={{ margin: "18px 0" }}>
            <label>
              Create a new ship
              <input
                type="text"
                placeholder="e.g. MV Ocean Star"
                value={shipForm.name}
                onChange={(e) => setShipForm((c) => ({ ...c, name: e.target.value }))}
                required
              />
            </label>
            <label>
              IMO Number
              <input
                type="text"
                placeholder="Optional"
                value={shipForm.imoNumber}
                onChange={(e) => setShipForm((c) => ({ ...c, imoNumber: e.target.value }))}
              />
            </label>
            <label>
              Call Sign
              <input
                type="text"
                placeholder="Optional"
                value={shipForm.callSign}
                onChange={(e) => setShipForm((c) => ({ ...c, callSign: e.target.value }))}
              />
            </label>
            <label>
              Ship Password
              <input
                type="password"
                placeholder="Others will need this to join"
                value={shipForm.password}
                onChange={(e) => setShipForm((c) => ({ ...c, password: e.target.value }))}
                minLength={4}
                required
              />
            </label>
            <button className="primaryButton largeButton" type="submit" style={{ marginTop: "10px" }}>
              Create Ship
            </button>
          </form>

          <button className="secondaryButton" onClick={handleLogout}>Log out</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app ${
        settings.darkMode ? "dark" : ""
      }`}
    >
      <style>{CSS}</style>

      <header className="topbar">
        <button
          className="brand"
          onClick={() => setPage("home")}
        >
          <span className="brandIcon">⚓</span>

          <span>
            <strong>Ballast Logbook</strong>
            <small>Shipboard Sounding System</small>
          </span>
        </button>

        <div className="shipSelectorTop">
          <span>SHIP</span>
          <select value={currentShipId} onChange={(e) => { setSelectedShipId(e.target.value); setPage("home"); }}>
            {ships.map((ship) => <option key={ship.id} value={ship.id}>{ship.name}</option>)}
          </select>
        </div>

        <div className="topbarRight">
          <span className="offlineStatus onlineStatus"><i /> ONLINE</span><span className="userTop">{profile?.full_name || user.email}</span><button className="logoutButton" onClick={handleLogout}>Log out</button>

          <button
            className="themeButton"
            onClick={() =>
              setSettings((current) => ({
                ...current,
                darkMode: !current.darkMode,
              }))
            }
          >
            {settings.darkMode ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <div className="appLayout">
        <aside className="sidebar">
          <nav>
            <NavButton
              icon="⌂"
              text="Home"
              active={page === "home"}
              onClick={() => setPage("home")}
            />

            <NavButton
              icon="＋"
              text="New Sounding"
              active={page === "new"}
              onClick={() => {
                resetSoundingForm();
                setPage("new");
              }}
            />

            <NavButton
              icon="☷"
              text="Log History"
              active={page === "history"}
              onClick={() => setPage("history")}
            />

            <NavButton
              icon="🚢"
              text="Ship Setup"
              active={page === "ships"}
              onClick={() => setPage("ships")}
            />

            <NavButton
              icon="▣"
              text="Tank Setup"
              active={page === "tanks"}
              onClick={() => setPage("tanks")}
            />

            <NavButton
              icon="↗"
              text="Depth Trends"
              active={page === "trends"}
              onClick={() => setPage("trends")}
            />

            <NavButton
              icon="⇩"
              text="Export / Backup"
              active={page === "backup"}
              onClick={() => setPage("backup")}
            />

            <NavButton
              icon="⚙"
              text="Settings"
              active={page === "settings"}
              onClick={() => setPage("settings")}
            />
          </nav>

          <div className="sidebarFooter">
            <div className="shipBadge">⚓</div>
            <strong>Ballast Depth</strong>
            <span>Local Logbook</span>
          </div>
        </aside>

        <main>
          {page === "home" && renderHome()}
          {page === "new" && renderNewSounding()}
          {page === "ships" && renderShips()}
          {page === "tanks" && renderTanks()}
          {page === "history" && renderHistory()}
          {page === "trends" && renderTrends()}
          {page === "backup" && renderBackup()}
          {page === "settings" && renderSettings()}
        </main>
      </div>

      {statusMessage && (
        <div className="toast">
          ✓ {statusMessage}
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          dialog={confirmDialog}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

function NavButton({ icon, text, active, onClick }) {
  return (
    <button
      className={`navButton ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span>{icon}</span>
      {text}
    </button>
  );
}

function EmptyState({ title, text, button, onClick }) {
  return (
    <div className="emptyState">
      <div className="emptyIcon">∅</div>
      <h3>{title}</h3>
      <p>{text}</p>

      {button && (
        <button className="primaryButton" onClick={onClick}>
          {button}
        </button>
      )}
    </div>
  );
}

function ConfirmDialog({ dialog, onCancel }) {
  return (
    <div className="modalBackdrop">
      <div className="modal">
        <div
          className={`modalIcon ${
            dialog.danger ? "danger" : ""
          }`}
        >
          !
        </div>

        <h2>{dialog.title}</h2>

        <p>{dialog.message}</p>

        <div className="modalActions">
          <button
            className="secondaryButton largeButton"
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            className={`largeButton ${
              dialog.danger
                ? "dangerButton"
                : "primaryButton"
            }`}
            onClick={dialog.onConfirm}
          >
            {dialog.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogTable({
  logs,
  getTankName,
  getFillPercent,
  onEdit,
  onDelete,
  detailed = false,
  showActions = true,
}) {
  if (logs.length === 0) {
    return (
      <div className="emptyState compact">
        <div className="emptyIcon">☷</div>
        <h3>No sounding records</h3>
        <p>
          Sounding entries will appear here after they are
          recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="tableWrapper">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Tank</th>
            <th>Depth</th>
            <th>Fill</th>

            {detailed && <th>Recorded By</th>}
            {detailed && <th>Notes</th>}

            {showActions && <th>Actions</th>}
          </tr>
        </thead>

        <tbody>
          {logs.map((log) => {
            const fill = getFillPercent(log);

            return (
              <tr key={log.id}>
                <td>{log.date}</td>
                <td>{log.time}</td>
                <td>
                  <strong>{getTankName(log.tankId)}</strong>
                </td>

                <td className="depthCell">
                  {log.depth} {log.unit}
                </td>

                <td>
                  {fill !== null
                    ? `${fill.toFixed(1)}%`
                    : "--"}
                </td>

                {detailed && (
                  <td>{log.recordedBy || "—"}</td>
                )}

                {detailed && (
                  <td className="notesCell">
                    {log.remarks || "—"}
                  </td>
                )}

                {showActions && (
                  <td>
                    <div className="rowActions">
                      <button
                        className="smallAction"
                        onClick={() => onEdit(log)}
                      >
                        Edit
                      </button>

                      <button
                        className="smallAction dangerText"
                        onClick={() => onDelete(log)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CSS = `
* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

body {
  background: #f4f6f8;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.app {
  min-height: 100vh;
  color: #15202b;
  background: #f4f6f8;
}

.app.dark {
  background: #000;
  color: #f2f2f2;
}

.topbar {
  height: 72px;
  background: #ffffff;
  border-bottom: 1px solid #e2e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 26px;
  position: sticky;
  top: 0;
  z-index: 20;
}

.dark .topbar {
  background: #000;
  border-color: #222;
}

.brand {
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  color: inherit;
}

.brandIcon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #102a43;
  color: white;
  display: grid;
  place-items: center;
  font-size: 21px;
}

.dark .brandIcon {
  background: #fff;
  color: #000;
}

.brand strong {
  display: block;
  font-size: 16px;
}

.brand small {
  display: block;
  color: #718096;
  font-size: 11px;
  margin-top: 2px;
}

.dark .brand small {
  color: #888;
}

.topbarRight {
  display: flex;
  align-items: center;
  gap: 14px;
}

.offlineStatus {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #27733e;
  display: flex;
  align-items: center;
  gap: 7px;
}

.dark .offlineStatus {
  color: #8ee8a5;
}

.offlineStatus i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2e9b50;
}

.themeButton {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  border: 1px solid #d9e0e5;
  background: #fff;
  color: #263238;
  font-size: 20px;
}

.dark .themeButton {
  background: #111;
  border-color: #333;
  color: white;
}

.appLayout {
  display: flex;
  min-height: calc(100vh - 72px);
}

.sidebar {
  width: 230px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e2e7eb;
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
}

.dark .sidebar {
  background: #050505;
  border-color: #222;
}

.sidebar nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.navButton {
  border: 0;
  background: transparent;
  color: #61707c;
  padding: 13px 14px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  font-weight: 650;
}

.navButton span {
  width: 24px;
  text-align: center;
  font-size: 19px;
}

.navButton:hover {
  background: #f0f3f5;
  color: #102a43;
}

.navButton.active {
  background: #102a43;
  color: white;
}

.dark .navButton {
  color: #aaa;
}

.dark .navButton:hover {
  background: #151515;
  color: white;
}

.dark .navButton.active {
  background: #fff;
  color: #000;
}

.sidebarFooter {
  margin-top: auto;
  padding: 16px 10px 8px;
  border-top: 1px solid #e2e7eb;
}

.dark .sidebarFooter {
  border-color: #222;
}

.shipBadge {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #eef2f5;
  margin-bottom: 9px;
}

.dark .shipBadge {
  background: #151515;
}

.sidebarFooter strong,
.sidebarFooter span {
  display: block;
}

.sidebarFooter span {
  font-size: 11px;
  color: #75818b;
  margin-top: 3px;
}

main {
  flex: 1;
  min-width: 0;
}

.page {
  max-width: 1450px;
  margin: auto;
  padding: 34px;
}

.page.narrow {
  max-width: 900px;
}

.hero {
  background: #102a43;
  color: white;
  border-radius: 18px;
  padding: 34px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.dark .hero {
  background: #111;
  border: 1px solid #292929;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.13em;
  font-weight: 850;
  opacity: 0.7;
  margin-bottom: 8px;
}

.hero h1,
.pageTitle h1 {
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.05;
  margin: 0;
}

.hero p,
.pageTitle p {
  margin: 10px 0 0;
  opacity: 0.72;
}

.heroIcon {
  font-size: 70px;
  opacity: 0.85;
}

.dashboardGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
  margin-bottom: 34px;
}

.dashboardCard {
  border: 1px solid #dde4e9;
  background: white;
  border-radius: 14px;
  padding: 22px;
  text-align: left;
  color: #17232d;
  min-height: 145px;
  transition: transform 0.15s;
}

.dashboardCard:hover {
  transform: translateY(-2px);
}

.dashboardCard.primary {
  background: #e9f0f6;
  border-color: #b8cad9;
}

.dark .dashboardCard {
  background: #0b0b0b;
  color: white;
  border-color: #292929;
}

.dark .dashboardCard.primary {
  background: #151515;
}

.cardIcon {
  display: block;
  font-size: 29px;
  margin-bottom: 17px;
}

.dashboardCard strong {
  display: block;
  font-size: 17px;
}

.dashboardCard small {
  display: block;
  margin-top: 5px;
  color: #71808c;
}

.dark .dashboardCard small {
  color: #888;
}

.section {
  margin-top: 32px;
}

.sectionHeader,
.pageTitle {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 17px;
}

.sectionHeader h2,
.formCard h2,
.tankListCard h2,
.backupCard h2 {
  margin: 0;
  font-size: 21px;
}

.sectionHeader p,
.listHeader p {
  margin: 5px 0 0;
  color: #74818b;
  font-size: 13px;
}

.dark .sectionHeader p,
.dark .listHeader p {
  color: #888;
}

.tankStatusGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.statusCard {
  background: white;
  border: 1px solid #dde4e9;
  border-radius: 13px;
  padding: 19px;
}

.dark .statusCard {
  background: #0a0a0a;
  border-color: #282828;
}

.statusTop,
.statusBottom {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.statusTop span,
.statusBottom {
  color: #7a8791;
  font-size: 12px;
}

.dark .statusTop span,
.dark .statusBottom {
  color: #888;
}

.bigDepth {
  font-size: 32px;
  font-weight: 800;
  margin: 17px 0 12px;
}

.bigDepth span {
  font-size: 15px;
  color: #74818b;
}

.progressTrack,
.largeProgressTrack {
  width: 100%;
  height: 8px;
  border-radius: 20px;
  overflow: hidden;
  background: #e5e9ec;
}

.dark .progressTrack,
.dark .largeProgressTrack {
  background: #252525;
}

.progressBar {
  height: 100%;
  border-radius: inherit;
  background: #3d657f;
}

.statusBottom {
  margin-top: 9px;
}

.noReading {
  padding: 25px 0 5px;
  color: #8b969e;
  font-size: 13px;
}

.tableWrapper {
  overflow-x: auto;
  border-radius: 13px;
  border: 1px solid #dfe5e9;
  background: white;
}

.dark .tableWrapper {
  background: #080808;
  border-color: #282828;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

th {
  background: #f5f7f8;
  color: #697680;
  text-align: left;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 13px 15px;
}

.dark th {
  background: #151515;
  color: #999;
}

td {
  padding: 15px;
  border-top: 1px solid #e8ecef;
  font-size: 13px;
}

.dark td {
  border-color: #242424;
}

.depthCell {
  font-weight: 800;
}

.notesCell {
  max-width: 250px;
  color: #6c7881;
}

.rowActions {
  display: flex;
  gap: 7px;
}

.smallAction {
  border: 1px solid #d7dfe4;
  background: transparent;
  padding: 7px 9px;
  border-radius: 7px;
  color: inherit;
  font-size: 11px;
  font-weight: 700;
}

.dark .smallAction {
  border-color: #3a3a3a;
}

.dangerText {
  color: #b13a3a;
}

.primaryButton,
.secondaryButton,
.dangerButton {
  border: 0;
  padding: 11px 15px;
  border-radius: 8px;
  font-weight: 750;
}

.primaryButton {
  background: #102a43;
  color: white;
}

.dark .primaryButton {
  background: white;
  color: black;
}

.secondaryButton {
  background: #eef2f4;
  color: #26343e;
}

.dark .secondaryButton {
  background: #1b1b1b;
  color: white;
}

.dangerButton {
  background: #b33434;
  color: white;
}

.largeButton {
  min-height: 47px;
  padding-left: 20px;
  padding-right: 20px;
}

.pageActions {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
}

.formCard,
.tankListCard,
.trendCard {
  background: white;
  border: 1px solid #dde4e9;
  border-radius: 15px;
  padding: 25px;
}

.dark .formCard,
.dark .tankListCard,
.dark .trendCard {
  background: #080808;
  border-color: #292929;
}

.formCard {
  display: flex;
  flex-direction: column;
  gap: 17px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-weight: 700;
  font-size: 13px;
}

input,
select,
textarea {
  border: 1px solid #cfd8de;
  background: white;
  color: #17232d;
  border-radius: 8px;
  min-height: 45px;
  padding: 10px 12px;
  outline: none;
}

textarea {
  resize: vertical;
}

.dark input,
.dark select,
.dark textarea {
  background: #111;
  border-color: #3a3a3a;
  color: white;
}

input:focus,
select:focus,
textarea:focus {
  border-color: #56758b;
  box-shadow: 0 0 0 2px rgba(56, 100, 130, 0.12);
}

.twoColumns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.tankInfo,
.notice,
.fillPanel {
  background: #f3f6f8;
  border: 1px solid #dfe6ea;
  border-radius: 10px;
  padding: 14px;
}

.dark .tankInfo,
.dark .notice,
.dark .fillPanel {
  background: #111;
  border-color: #2d2d2d;
}

.tankInfo {
  display: flex;
  gap: 30px;
}

.tankInfo span,
.tankInfo strong {
  display: block;
}

.tankInfo span,
.fillPanel span {
  font-size: 11px;
  color: #75818b;
}

.tankInfo strong {
  margin-top: 4px;
}

.fillPanel > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 11px;
}

.fillPanel strong {
  font-size: 24px;
}

.fillPanel small {
  display: block;
  color: #76838d;
  margin-top: 8px;
}

.formActions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 5px;
}

.notice {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notice strong {
  font-size: 13px;
}

.notice span {
  color: #687681;
  font-size: 12px;
  line-height: 1.5;
}

.setupGrid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 18px;
}

.tankListCard {
  min-width: 0;
}

.listHeader {
  margin-bottom: 17px;
}

.tankList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tankRow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px;
  border: 1px solid #e0e5e8;
  border-radius: 10px;
}

.dark .tankRow {
  border-color: #292929;
}

.tankNumber {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #edf1f3;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 12px;
}

.dark .tankNumber {
  background: #191919;
}

.tankDetails {
  flex: 1;
  min-width: 0;
}

.tankDetails strong,
.tankDetails span {
  display: block;
}

.tankDetails span {
  color: #78858e;
  font-size: 11px;
  margin-top: 4px;
}

.tankControls {
  display: flex;
  gap: 4px;
}

.iconButton {
  width: 34px;
  height: 34px;
  border: 1px solid #d7dfe3;
  background: transparent;
  color: inherit;
  border-radius: 7px;
}

.dark .iconButton {
  border-color: #353535;
}

.iconButton:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.iconButton.danger {
  color: #bd3737;
}

.filterCard {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr auto;
  gap: 12px;
  align-items: end;
  background: white;
  border: 1px solid #dde4e9;
  border-radius: 13px;
  padding: 16px;
  margin-bottom: 13px;
}

.dark .filterCard {
  background: #080808;
  border-color: #292929;
}

.resultsCount {
  color: #77838c;
  font-size: 12px;
  margin: 12px 2px;
}

.trendCard {
  overflow: hidden;
}

.trendChart {
  height: 390px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 35px 15px 20px;
  overflow-x: auto;
  margin-top: 20px;
  border-top: 1px solid #e5e9ec;
  border-bottom: 1px solid #e5e9ec;
}

.dark .trendChart {
  border-color: #292929;
}

.chartColumn {
  min-width: 70px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
}

.chartValue {
  font-size: 10px;
  margin-bottom: 5px;
  color: #6e7c86;
}

.chartBarArea {
  height: 270px;
  width: 35px;
  display: flex;
  align-items: flex-end;
}

.chartBar {
  width: 100%;
  border-radius: 5px 5px 0 0;
  background: #3d657f;
}

.chartLabel {
  font-size: 9px;
  color: #7c8790;
  text-align: center;
  margin-top: 8px;
  line-height: 1.4;
}

.trendLegend {
  display: flex;
  gap: 25px;
  margin-top: 15px;
  color: #73808a;
  font-size: 12px;
}

.trendLegend strong {
  color: inherit;
}

.backupGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.backupCard {
  background: white;
  border: 1px solid #dde4e9;
  border-radius: 14px;
  padding: 24px;
}

.dark .backupCard {
  background: #080808;
  border-color: #292929;
}

.backupIcon {
  font-size: 27px;
  display: block;
  margin-bottom: 16px;
}

.backupCard p {
  color: #75818b;
  font-size: 13px;
  line-height: 1.5;
  min-height: 58px;
}

.fileButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 10px 15px;
  background: #102a43;
  color: white;
  border-radius: 8px;
  cursor: pointer;
}

.dark .fileButton {
  background: white;
  color: black;
}

.fileButton input {
  display: none;
}

.toggleRow {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.toggleRow div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggleRow span {
  font-size: 12px;
  color: #75818b;
  font-weight: 400;
}

.toggleRow input {
  min-height: auto;
  width: 22px;
  height: 22px;
}

.emptyState {
  background: white;
  border: 1px dashed #cdd7dd;
  border-radius: 13px;
  padding: 45px 20px;
  text-align: center;
}

.dark .emptyState {
  background: #080808;
  border-color: #333;
}

.emptyState.compact {
  padding: 30px;
}

.emptyIcon {
  font-size: 30px;
  opacity: 0.45;
}

.emptyState h3 {
  margin: 9px 0 5px;
}

.emptyState p {
  margin: 0 0 15px;
  color: #78848d;
  font-size: 13px;
}

.toast {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 100;
  background: #102a43;
  color: white;
  padding: 13px 17px;
  border-radius: 9px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.2);
  font-size: 13px;
  font-weight: 700;
}

.dark .toast {
  background: white;
  color: black;
}

.modalBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.62);
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 20px;
}

.modal {
  width: min(480px, 100%);
  background: white;
  color: #17232d;
  border-radius: 15px;
  padding: 28px;
  box-shadow: 0 20px 70px rgba(0,0,0,0.35);
}

.dark .modal {
  background: #111;
  color: white;
}

.modalIcon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #e7eef4;
  color: #23445d;
  display: grid;
  place-items: center;
  font-weight: 900;
  font-size: 20px;
}

.modalIcon.danger {
  background: #f9e6e6;
  color: #a62d2d;
}

.modal h2 {
  margin: 17px 0 8px;
}

.modal p {
  color: #687681;
  line-height: 1.6;
  font-size: 13px;
}

.dark .modal p {
  color: #999;
}

.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 23px;
}

@media (max-width: 1100px) {
  .dashboardGrid {
    grid-template-columns: repeat(2, 1fr);
  }

  .tankStatusGrid {
    grid-template-columns: repeat(2, 1fr);
  }

  .setupGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 800px) {
  .sidebar {
    width: 72px;
    padding: 15px 8px;
  }

  .navButton {
    justify-content: center;
    padding: 13px 5px;
  }

  .navButton span {
    margin: 0;
  }

  .navButton {
    font-size: 0;
  }

  .navButton span {
    font-size: 21px;
  }

  .sidebarFooter {
    display: none;
  }

  .page {
    padding: 20px;
  }

  .hero {
    padding: 24px;
  }

  .heroIcon {
    font-size: 48px;
  }

  .tankStatusGrid {
    grid-template-columns: 1fr;
  }

  .filterCard {
    grid-template-columns: 1fr 1fr;
  }

  .filterCard > button {
    grid-column: 1 / -1;
  }

  .backupGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .topbar {
    padding: 0 13px;
  }

  .brand small {
    display: none;
  }

  .offlineStatus {
    display: none;
  }

  .dashboardGrid {
    grid-template-columns: 1fr;
  }

  .twoColumns {
    grid-template-columns: 1fr;
  }

  .tankInfo {
    flex-direction: column;
    gap: 12px;
  }

  .pageTitle {
    align-items: flex-start;
    flex-direction: column;
  }

  .filterCard {
    grid-template-columns: 1fr;
  }

  .filterCard > button {
    grid-column: auto;
  }

  .formActions {
    flex-direction: column-reverse;
  }

  .formActions button {
    width: 100%;
  }

  .hero {
    margin-bottom: 15px;
  }

  .hero h1 {
    font-size: 29px;
  }
}

@media print {
  .topbar,
  .sidebar,
  .pageActions,
  .filterCard,
  .rowActions,
  .toast {
    display: none !important;
  }

  .appLayout {
    display: block;
  }

  .page {
    max-width: none;
    padding: 10px;
  }

  .tableWrapper {
    border: 0;
  }

  body,
  .app {
    background: white !important;
    color: black !important;
  }

  table {
    min-width: 0;
  }
}


.shipSelectorTop { display:flex; align-items:center; gap:8px; margin-left:auto; margin-right:14px; }
.shipSelectorTop span { font-size:11px; font-weight:800; letter-spacing:.12em; opacity:.65; }
.shipSelectorTop select { min-width:180px; padding:8px 10px; border-radius:10px; border:1px solid rgba(128,128,128,.3); background:inherit; color:inherit; font-weight:700; }
.shipNotice { margin-bottom:18px; }
.authScreen { min-height:100vh; display:grid; place-items:center; padding:24px; background:#0b0d0f; color:#f4f6f8; }
.authCard { width:min(430px,100%); background:#15191d; border:1px solid rgba(255,255,255,.1); border-radius:22px; padding:34px; box-shadow:0 25px 70px rgba(0,0,0,.35); }
.authCard h1 { margin:10px 0 8px; }
.authCard p { opacity:.7; line-height:1.5; }
.authCard label { display:block; margin:18px 0; font-weight:700; }
.authCard input { width:100%; box-sizing:border-box; margin-top:8px; padding:12px 13px; border-radius:10px; border:1px solid rgba(128,128,128,.35); background:rgba(255,255,255,.04); color:inherit; }
.authError { padding:12px; border-radius:10px; background:rgba(220,60,60,.12); color:#ff9d9d; margin:12px 0; }
.onlineStatus i { background:#38d996 !important; }
.userTop { font-size:12px; font-weight:700; opacity:.8; margin-right:10px; }
.logoutButton { border:1px solid rgba(128,128,128,.3); background:transparent; color:inherit; border-radius:9px; padding:8px 10px; cursor:pointer; }
`;

export default App;