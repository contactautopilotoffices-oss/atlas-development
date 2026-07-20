/* ATLAS client routing manifest.
   Demo ID + password are looked up here; the matching client's config/data/geo
   files are loaded after a successful login. This keeps the public URL clean:
   anyone can be sent atlas.autopilotoffices.com and will be routed by their
   own credentials. */
window.CLIENT_MANIFEST = {
  "FLIPDEMOACC": { slug: "flipkart-andheri", pass: "FLIP1234" },
  "VFSDEMOACC":  { slug: "vfs-bkc",          pass: "VFS1234" }
};
