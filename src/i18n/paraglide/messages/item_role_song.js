/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Item_Role_SongInputs */

const uk_item_role_song = /** @type {(inputs: Item_Role_SongInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`запис`)
};

const en_item_role_song = /** @type {(inputs: Item_Role_SongInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`recording`)
};

/**
* | output |
* | --- |
* | "recording" |
*
* @param {Item_Role_SongInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const item_role_song = /** @type {((inputs?: Item_Role_SongInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Item_Role_SongInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_item_role_song(inputs)
	return en_item_role_song(inputs)
});