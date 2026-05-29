/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Action_DeleteInputs */

const uk_songs_action_delete = /** @type {(inputs: Songs_Action_DeleteInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Видалити`)
};

const en_songs_action_delete = /** @type {(inputs: Songs_Action_DeleteInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Delete`)
};

/**
* | output |
* | --- |
* | "Delete" |
*
* @param {Songs_Action_DeleteInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_action_delete = /** @type {((inputs?: Songs_Action_DeleteInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Action_DeleteInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_action_delete(inputs)
	return en_songs_action_delete(inputs)
});