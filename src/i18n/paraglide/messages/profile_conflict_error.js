/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Conflict_ErrorInputs */

const uk_profile_conflict_error = /** @type {(inputs: Profile_Conflict_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Профіль із такою назвою вже існує`)
};

const en_profile_conflict_error = /** @type {(inputs: Profile_Conflict_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`A profile with this name already exists`)
};

/**
* | output |
* | --- |
* | "A profile with this name already exists" |
*
* @param {Profile_Conflict_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_conflict_error = /** @type {((inputs?: Profile_Conflict_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Conflict_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_conflict_error(inputs)
	return en_profile_conflict_error(inputs)
});