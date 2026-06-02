/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_Row_ActionsInputs */

const uk_profile_row_actions = /** @type {(inputs: Profile_Row_ActionsInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Дії для профілю ${i?.name}`)
};

const en_profile_row_actions = /** @type {(inputs: Profile_Row_ActionsInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Actions for profile ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Actions for profile {name}" |
*
* @param {Profile_Row_ActionsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_row_actions = /** @type {((inputs: Profile_Row_ActionsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Row_ActionsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_row_actions(inputs)
	return en_profile_row_actions(inputs)
});