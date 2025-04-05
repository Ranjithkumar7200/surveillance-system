export const dbHelper = {
  DB_NAME: "surveillanceDB",
  DB_VERSION: 2,
  db: null,

  // Initialize the database
  initDB: () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbHelper.DB_NAME, dbHelper.DB_VERSION);

      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject("Error opening database");
      };

      request.onsuccess = (event) => {
        dbHelper.db = event.target.result;
        console.log("Database opened successfully");
        resolve(dbHelper.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores for our data
        if (!db.objectStoreNames.contains("detections")) {
          db.createObjectStore("detections", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("knownFaces")) {
          db.createObjectStore("knownFaces", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("notifications")) {
          db.createObjectStore("notifications", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
      };
    });
  },

  // Store data in a specific object store
  storeData: (storeName, data) => {
    return new Promise((resolve, reject) => {
      if (!dbHelper.db) {
        reject("Database not initialized");
        return;
      }

      const transaction = dbHelper.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // Store multiple items at once
  storeMultipleData: (storeName, dataArray) => {
    return new Promise((resolve, reject) => {
      if (!dbHelper.db) {
        reject("Database not initialized");
        return;
      }

      const transaction = dbHelper.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);

      let completed = 0;
      let errors = 0;

      dataArray.forEach((data) => {
        const request = store.put(data);
        request.onsuccess = () => {
          completed++;
          if (completed + errors === dataArray.length) {
            resolve(completed);
          }
        };
        request.onerror = () => {
          errors++;
          console.error("Error storing item:", request.error);
          if (completed + errors === dataArray.length) {
            resolve(completed);
          }
        };
      });

      // If the array is empty, resolve immediately
      if (dataArray.length === 0) {
        resolve(0);
      }
    });
  },

  // Get all data from a store
  getAllData: (storeName) => {
    return new Promise((resolve, reject) => {
      if (!dbHelper.db) {
        reject("Database not initialized");
        return;
      }

      const transaction = dbHelper.db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // Get data by ID
  getDataById: (storeName, id) => {
    return new Promise((resolve, reject) => {
      if (!dbHelper.db) {
        reject("Database not initialized");
        return;
      }

      const transaction = dbHelper.db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // Delete data by ID
  deleteData: (storeName, id) => {
    return new Promise((resolve, reject) => {
      if (!dbHelper.db) {
        reject("Database not initialized");
        return;
      }

      const transaction = dbHelper.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  // Clear an entire object store
  clearStore: (storeName) => {
    return new Promise((resolve, reject) => {
      if (!dbHelper.db) {
        reject("Database not initialized");
        return;
      }

      const transaction = dbHelper.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },
};
