import Database from "better-sqlite3";
import { v7 as uuidv7 } from "uuid";
import { homedir } from "node:os";
import { join } from "node:path";

function parseArgs(argv) {
  const args = {
    dbPath: null,
    workspaceId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--db") {
      args.dbPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--workspace") {
      args.workspaceId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
  }

  return args;
}

function getAppDataDirectory() {
  const home = homedir();

  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Application Support");
    case "win32":
      return process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    default:
      return process.env.XDG_DATA_HOME ?? join(home, ".local", "share");
  }
}

function getUserDataDirectory() {
  if (process.env.HANOKI_USER_DATA_DIR) {
    return process.env.HANOKI_USER_DATA_DIR;
  }

  const appIdentifier = process.env.HANOKI_APP_IDENTIFIER ?? "com.hanoki.app";
  const channel =
    process.env.HANOKI_APP_CHANNEL ?? (process.env.NODE_ENV === "production" ? "data" : "data-dev");
  return join(getAppDataDirectory(), appIdentifier, channel);
}

function getDefaultDbPath() {
  return join(getUserDataDirectory(), "app.sqlite");
}

function insertFolder(db, { workspaceId, parentId, name }) {
  const id = uuidv7();
  db.prepare(
    "INSERT INTO folders (id, workspace_id, parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, workspaceId, parentId, name, Date.now(), Date.now());
  return id;
}

function insertChat(db, { workspaceId, folderId, title }) {
  const id = uuidv7();
  db.prepare(
    "INSERT INTO chats (id, workspace_id, folder_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, workspaceId, folderId, title, Date.now(), Date.now());
  return id;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.dbPath ?? getDefaultDbPath();

  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");

  try {
    const workspace = args.workspaceId
      ? sqlite.prepare("SELECT id, name FROM workspaces WHERE id = ? LIMIT 1").get(args.workspaceId)
      : sqlite.prepare("SELECT id, name FROM workspaces ORDER BY id ASC LIMIT 1").get();

    if (!workspace) {
      throw new Error("No workspace found. Create a workspace first.");
    }

    const existingDemoFolder = sqlite
      .prepare(
        "SELECT id FROM folders WHERE workspace_id = ? AND parent_id IS NULL AND name = ? LIMIT 1",
      )
      .get(workspace.id, "Demo Tree");

    if (existingDemoFolder) {
      console.log(`Seed skipped: "Demo Tree" already exists in workspace ${workspace.id}.`);
      return;
    }

    sqlite.transaction(() => {
      insertChat(sqlite, { workspaceId: workspace.id, folderId: null, title: "Inbox" });
      insertChat(sqlite, { workspaceId: workspace.id, folderId: null, title: "Scratchpad" });

      const demoTreeId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: null,
        name: "Demo Tree",
      });

      const productId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: demoTreeId,
        name: "Product",
      });
      const researchId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: demoTreeId,
        name: "Research",
      });
      const engineeringId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: demoTreeId,
        name: "Engineering",
      });

      const roadmapId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: productId,
        name: "Roadmap",
      });
      const backlogId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: productId,
        name: "Backlog",
      });

      const usersId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: researchId,
        name: "Users",
      });
      const competitorsId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: researchId,
        name: "Competitors",
      });

      const frontendId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: engineeringId,
        name: "Frontend",
      });
      const backendId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: engineeringId,
        name: "Backend",
      });
      const apiId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: backendId,
        name: "API",
      });
      const infraId = insertFolder(sqlite, {
        workspaceId: workspace.id,
        parentId: backendId,
        name: "Infra",
      });

      insertChat(sqlite, {
        workspaceId: workspace.id,
        folderId: demoTreeId,
        title: "Demo Overview",
      });
      insertChat(sqlite, { workspaceId: workspace.id, folderId: roadmapId, title: "Q2 Roadmap" });
      insertChat(sqlite, {
        workspaceId: workspace.id,
        folderId: backlogId,
        title: "Backlog Grooming",
      });
      insertChat(sqlite, {
        workspaceId: workspace.id,
        folderId: usersId,
        title: "User Interviews",
      });
      insertChat(sqlite, {
        workspaceId: workspace.id,
        folderId: competitorsId,
        title: "Competitor Notes",
      });
      insertChat(sqlite, {
        workspaceId: workspace.id,
        folderId: frontendId,
        title: "UI Tree Integration",
      });
      insertChat(sqlite, { workspaceId: workspace.id, folderId: backendId, title: "IPC + State" });
      insertChat(sqlite, { workspaceId: workspace.id, folderId: apiId, title: "API Contracts" });
      insertChat(sqlite, {
        workspaceId: workspace.id,
        folderId: infraId,
        title: "Deployment Notes",
      });
    })();

    console.log(`Seeded chat tree demo data in workspace ${workspace.id} (${workspace.name}).`);
    console.log(`Database: ${dbPath}`);
  } finally {
    sqlite.close();
  }
}

main();
