/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_Delete_ConfirmInputs */

const uk_profile_delete_confirm = /** @type {(inputs: Profile_Delete_ConfirmInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Видалити профіль "${i?.name}"? Ця дія незворотна.`)
};

const en_profile_delete_confirm = /** @type {(inputs: Profile_Delete_ConfirmInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Delete profile "${i?.name}"? This cannot be undone.`)
};

/**
* | output |
* | --- |
* | "Delete profile \"{name}\"? This cannot be undone." |
*
* @param {Profile_Delete_ConfirmInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_delete_confirm = /** @type {((inputs: Profile_Delete_ConfirmInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Delete_ConfirmInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_delete_confirm(inputs)
	return en_profile_delete_confirm(inputs)
});