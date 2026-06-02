/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_ActionsInputs */

const uk_profile_actions = /** @type {(inputs: Profile_ActionsInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Дії для ${i?.name}`)
};

const en_profile_actions = /** @type {(inputs: Profile_ActionsInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Actions for ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Actions for {name}" |
*
* @param {Profile_ActionsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_actions = /** @type {((inputs: Profile_ActionsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_ActionsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_actions(inputs)
	return en_profile_actions(inputs)
});