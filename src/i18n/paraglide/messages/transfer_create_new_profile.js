/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Transfer_Create_New_ProfileInputs */

const uk_transfer_create_new_profile = /** @type {(inputs: Transfer_Create_New_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`+ Новий профіль…`)
};

const en_transfer_create_new_profile = /** @type {(inputs: Transfer_Create_New_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`+ New profile…`)
};

/**
* | output |
* | --- |
* | "+ New profile…" |
*
* @param {Transfer_Create_New_ProfileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const transfer_create_new_profile = /** @type {((inputs?: Transfer_Create_New_ProfileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Transfer_Create_New_ProfileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_transfer_create_new_profile(inputs)
	return en_transfer_create_new_profile(inputs)
});