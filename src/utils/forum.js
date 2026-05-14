import db from '../db/database.js';
import { cfgGet } from './setup.js';

export const getForumCommandesId = () => cfgGet('FORUM_COMMANDES_ID');
export const getForumOffresId    = () => cfgGet('FORUM_OFFRES_ID');

export function getBuyerPostId(clientId) {
  return db.prepare('SELECT post_id FROM forum_posts_acheteurs WHERE client_id=?').get(clientId)?.post_id ?? null;
}
export function setBuyerPostId(clientId, postId) {
  db.prepare('INSERT OR REPLACE INTO forum_posts_acheteurs (client_id, post_id) VALUES (?,?)').run(clientId, postId);
}
export function removeBuyerPost(clientId) {
  db.prepare('DELETE FROM forum_posts_acheteurs WHERE client_id=?').run(clientId);
}
export function isBuyerDone(clientId) {
  return db.prepare("SELECT COUNT(*) as n FROM commandes WHERE client_id=? AND statut NOT IN ('livree','annulee')").get(clientId).n === 0;
}

export function getSellerPostId(vendeurId) {
  return db.prepare('SELECT post_id FROM forum_posts_vendeurs WHERE vendeur_id=?').get(vendeurId)?.post_id ?? null;
}
export function setSellerPostId(vendeurId, postId) {
  db.prepare('INSERT OR REPLACE INTO forum_posts_vendeurs (vendeur_id, post_id) VALUES (?,?)').run(vendeurId, postId);
}
export function removeSellerPost(vendeurId) {
  db.prepare('DELETE FROM forum_posts_vendeurs WHERE vendeur_id=?').run(vendeurId);
}
export function isSellerDone(vendeurId) {
  return db.prepare("SELECT COUNT(*) as n FROM offres_vente WHERE vendeur_id=? AND statut='en_attente'").get(vendeurId).n === 0;
}
